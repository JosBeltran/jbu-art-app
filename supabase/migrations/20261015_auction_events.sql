-- Eventos de subasta: capa padre OPCIONAL que agrupa subastas existentes como Lotes.
-- Aditiva: no renombra ni borra nada; place_bid, settle_auctions, reserva, anti-sniping y Stripe quedan intactos.
-- Requiere 20261014_auctions.sql.

create table if not exists public.auction_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  subtitle text,
  description text,
  cover_image_url text,
  starts_at timestamptz not null,
  closing_starts_at timestamptz,
  -- Estado administrativo. El estado efectivo (LIVE/CLOSING/ENDED) se deriva de los lotes reales en la vista pública.
  status text not null default 'DRAFT' check (status in ('DRAFT','UPCOMING','LIVE','CLOSING','ENDED','CANCELLED')),
  featured boolean not null default false,
  sequential_closing_enabled boolean not null default false,
  closing_interval_minutes integer not null default 2 check (closing_interval_minutes between 1 and 240),
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closing_starts_at is null or closing_starts_at > starts_at)
);

-- Un lote = una subasta existente. Columna única => una subasta no puede pertenecer a dos eventos.
alter table public.auctions add column if not exists auction_event_id uuid references public.auction_events(id) on delete set null;
alter table public.auctions add column if not exists lot_number integer check (lot_number is null or lot_number > 0);
alter table public.auctions add column if not exists lot_order integer;
create index if not exists auctions_event_idx on public.auctions (auction_event_id, lot_order);
create unique index if not exists auctions_event_lot_number on public.auctions (auction_event_id, lot_number) where auction_event_id is not null;

create table if not exists public.auction_event_watchers (
  id uuid primary key default gen_random_uuid(),
  auction_event_id uuid not null references public.auction_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (auction_event_id, user_id)
);

drop trigger if exists auction_events_set_updated on public.auction_events;
create trigger auction_events_set_updated before update on public.auction_events for each row execute function public.auction_set_updated();

-- ───────────── Permisos y RLS ─────────────
revoke all on public.auction_events, public.auction_event_watchers from anon, authenticated;
grant all on public.auction_events, public.auction_event_watchers to service_role;
grant select, insert, update, delete on public.auction_events to authenticated;   -- escritura limitada a admin por RLS
grant select on public.auction_events to anon;
grant select, insert, delete on public.auction_event_watchers to authenticated;

alter table public.auction_events enable row level security;
alter table public.auction_event_watchers enable row level security;

drop policy if exists "events public read" on public.auction_events;
create policy "events public read" on public.auction_events for select to anon, authenticated using (status <> 'DRAFT' or public.is_jbu_admin());
drop policy if exists "events admin write" on public.auction_events;
create policy "events admin write" on public.auction_events for all to authenticated using (public.is_jbu_admin()) with check (public.is_jbu_admin());

drop policy if exists "event watchers own read" on public.auction_event_watchers;
create policy "event watchers own read" on public.auction_event_watchers for select to authenticated using (user_id = auth.uid() or public.is_jbu_admin());
drop policy if exists "event watchers own insert" on public.auction_event_watchers;
create policy "event watchers own insert" on public.auction_event_watchers for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "event watchers own delete" on public.auction_event_watchers;
create policy "event watchers own delete" on public.auction_event_watchers for delete to authenticated using (user_id = auth.uid());

-- ───────────── Vista pública de subastas: mismas columnas + contexto de lote (añadidas al final) ─────────────
create or replace view public.auctions_public as
select a.id, a.artwork_id, a.status, a.starts_at, a.ends_at, a.starting_bid, a.buy_now_price,
       a.minimum_increment, a.current_bid, a.bid_count, a.anti_sniping_enabled, a.extension_minutes,
       a.extended_count, a.sale_type, a.updated_at,
       (a.reserve_price is not null) as has_reserve,
       (a.reserve_price is null or coalesce(a.current_bid,0) >= a.reserve_price) as reserve_met,
       case when a.current_bid is null then a.starting_bid else a.current_bid + a.minimum_increment end as next_minimum_bid,
       now() as server_now,
       a.auction_event_id, a.lot_number, a.original_ends_at
  from public.auctions a
 where a.status <> 'DRAFT';
grant select on public.auctions_public to anon, authenticated;

-- Vista pública de eventos con estado efectivo derivado de los ends_at reales de cada lote.
-- Nunca expone reserva, identidades, correos ni pagos.
create or replace view public.auction_events_public as
select e.id, e.name, e.slug, e.subtitle, e.description, e.cover_image_url, e.starts_at, e.closing_starts_at,
       e.featured, e.sequential_closing_enabled, e.closing_interval_minutes, e.updated_at,
       s.lot_count, s.open_count, s.first_close_at, s.next_close_at, s.last_close_at,
       case
         when e.status = 'CANCELLED' then 'CANCELLED'
         when s.lot_count > 0 and s.open_count = 0 and now() >= e.starts_at then 'ENDED'
         when now() < e.starts_at then 'UPCOMING'
         when least(e.closing_starts_at, s.first_close_at) is not null and now() >= least(e.closing_starts_at, s.first_close_at) then 'CLOSING'
         else 'LIVE'
       end as effective_status,
       now() as server_now
  from public.auction_events e
  left join lateral (
    select count(*)::int as lot_count,
           count(*) filter (where a.status in ('UPCOMING','LIVE'))::int as open_count,
           min(coalesce(a.original_ends_at, a.ends_at)) as first_close_at,
           min(a.ends_at) filter (where a.status in ('UPCOMING','LIVE')) as next_close_at,
           max(a.ends_at) as last_close_at
      from public.auctions a where a.auction_event_id = e.id and a.status <> 'DRAFT'
  ) s on true
 where e.status <> 'DRAFT';
grant select on public.auction_events_public to anon, authenticated;

-- ───────────── Funciones admin (validadas en servidor) ─────────────

-- Renumera lotes según lot_order y, si hay cierre secuencial, recalcula ends_at
-- SOLO en lotes sin pujas y aún no en vivo. Nunca mueve lotes con pujas ni extendidos.
create or replace function public.admin_event_apply_schedule(_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare e public.auction_events%rowtype; r record; n integer := 0; moved integer := 0; target timestamptz;
begin
  if not public.is_jbu_admin() then raise exception 'forbidden'; end if;
  select * into e from public.auction_events where id = _event for update;
  if not found then raise exception 'not found'; end if;
  -- numeración temporal para no chocar con el índice único
  update public.auctions set lot_number = null where auction_event_id = _event;
  for r in select id, status, bid_count, starts_at from public.auctions
            where auction_event_id = _event order by lot_order nulls last, created_at for update loop
    n := n + 1;
    update public.auctions set lot_number = n, lot_order = n where id = r.id;
    if e.sequential_closing_enabled and e.closing_starts_at is not null
       and r.bid_count = 0 and r.status in ('DRAFT','UPCOMING') then
      target := e.closing_starts_at + make_interval(mins => (n - 1) * e.closing_interval_minutes);
      if target > r.starts_at then
        update public.auctions set ends_at = target, original_ends_at = null where id = r.id;
        moved := moved + 1;
      end if;
    end if;
  end loop;
  return moved;
end $$;
grant execute on function public.admin_event_apply_schedule(uuid) to authenticated;

-- Reordenar lotes. Bloqueado si algún lote ya tiene pujas; si el evento ya empezó requiere _confirm.
create or replace function public.admin_event_reorder(_event uuid, _ids uuid[], _confirm boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare e public.auction_events%rowtype; i integer;
begin
  if not public.is_jbu_admin() then raise exception 'forbidden'; end if;
  select * into e from public.auction_events where id = _event for update;
  if not found then return 'NOT_FOUND'; end if;
  if exists (select 1 from public.auctions where auction_event_id = _event and bid_count > 0) then return 'HAS_BIDS'; end if;
  if now() >= e.starts_at and not _confirm then return 'CONFIRM_REQUIRED'; end if;
  if (select count(*) from public.auctions where auction_event_id = _event) <> coalesce(array_length(_ids, 1), 0)
     or exists (select 1 from unnest(_ids) x where not exists (select 1 from public.auctions a where a.id = x and a.auction_event_id = _event)) then
    return 'MISMATCH';
  end if;
  for i in 1 .. array_length(_ids, 1) loop
    update public.auctions set lot_order = i where id = _ids[i];
  end loop;
  perform public.admin_event_apply_schedule(_event);
  return 'OK';
end $$;
grant execute on function public.admin_event_reorder(uuid, uuid[], boolean) to authenticated;

-- Asignar una subasta existente como lote. Rechaza si ya pertenece a otro evento o está cerrada.
create or replace function public.admin_event_add_lot(_event uuid, _auction uuid)
returns text language plpgsql security definer set search_path = public as $$
declare a public.auctions%rowtype; nxt integer;
begin
  if not public.is_jbu_admin() then raise exception 'forbidden'; end if;
  perform 1 from public.auction_events where id = _event and status <> 'CANCELLED' for update;
  if not found then return 'NOT_FOUND'; end if;
  select * into a from public.auctions where id = _auction for update;
  if not found then return 'NOT_FOUND'; end if;
  if a.auction_event_id = _event then return 'OK'; end if;
  if a.auction_event_id is not null then return 'IN_OTHER_EVENT'; end if;
  if a.status not in ('DRAFT','UPCOMING','LIVE') then return 'CLOSED'; end if;
  select coalesce(max(lot_order), 0) + 1 into nxt from public.auctions where auction_event_id = _event;
  update public.auctions set auction_event_id = _event, lot_order = nxt where id = _auction;
  perform public.admin_event_apply_schedule(_event);
  return 'OK';
end $$;
grant execute on function public.admin_event_add_lot(uuid, uuid) to authenticated;

-- Quitar un lote: solo si no tiene pujas. La subasta sigue existiendo como independiente.
create or replace function public.admin_event_remove_lot(_event uuid, _auction uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_jbu_admin() then raise exception 'forbidden'; end if;
  if exists (select 1 from public.auctions where id = _auction and auction_event_id = _event and bid_count > 0) then return 'HAS_BIDS'; end if;
  update public.auctions set auction_event_id = null, lot_number = null, lot_order = null where id = _auction and auction_event_id = _event;
  perform public.admin_event_apply_schedule(_event);
  return 'OK';
end $$;
grant execute on function public.admin_event_remove_lot(uuid, uuid) to authenticated;
