-- Subastas en línea (módulo aislado). Solo crea objetos nuevos; no modifica tablas existentes.

-- Regla de administrador (misma que usa el panel)
create or replace function public.is_jbu_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and upper(coalesce(role,'')) in ('ADMIN','ADMINISTRADOR'));
$$;

-- ───────────── Tablas ─────────────
create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete restrict,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','UPCOMING','LIVE','ENDED','SOLD','RESERVE_NOT_MET','CANCELLED')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  original_ends_at timestamptz,
  starting_bid numeric(12,2) not null check (starting_bid > 0),
  reserve_price numeric(12,2) check (reserve_price is null or reserve_price > 0),
  buy_now_price numeric(12,2) check (buy_now_price is null or buy_now_price > 0),
  minimum_increment numeric(12,2) not null default 500 check (minimum_increment > 0),
  current_bid numeric(12,2),
  current_bidder_id uuid references auth.users(id),
  bid_count integer not null default 0,
  anti_sniping_enabled boolean not null default true,
  extension_minutes integer not null default 2 check (extension_minutes between 1 and 60),
  extended_count integer not null default 0,
  winner_id uuid references auth.users(id),
  winning_amount numeric(12,2),
  sale_type text check (sale_type in ('BID','BUY_NOW')),
  payment_status text not null default 'NONE' check (payment_status in ('NONE','PENDING','PAID','EXPIRED')),
  payment_window_hours integer not null default 72 check (payment_window_hours between 1 and 720),
  payment_due_at timestamptz,
  paid_at timestamptz,
  stripe_session_id text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (buy_now_price is null or buy_now_price >= starting_bid)
);
create index if not exists auctions_artwork_idx on public.auctions (artwork_id);
create index if not exists auctions_status_idx on public.auctions (status, ends_at);
-- Una sola subasta abierta por obra
create unique index if not exists auctions_one_open_per_artwork
  on public.auctions (artwork_id) where status in ('UPCOMING','LIVE');

create table if not exists public.auction_aliases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alias_number integer not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'VALID' check (status in ('VALID','RETRACTED','VOID')),
  created_at timestamptz not null default now()
);
create index if not exists auction_bids_auction_idx on public.auction_bids (auction_id, amount desc);
create index if not exists auction_bids_user_idx on public.auction_bids (user_id);

create table if not exists public.auction_watchers (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  unique (auction_id, user_id)
);

-- Avisos futuros (empieza, en vivo, te superaron, reserva, 24h, 1h, ganaste, terminó)
create table if not exists public.auction_notifications (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('STARTING_SOON','LIVE','OUTBID','RESERVE_MET','H24','H1','WON','ENDED')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (auction_id, user_id, kind)
);

-- Señal pública mínima para tiempo real (sin datos sensibles)
create table if not exists public.auction_ticks (
  auction_id uuid primary key references public.auctions(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- Idempotencia del webhook de Stripe
create table if not exists public.stripe_events (
  id text primary key,
  type text,
  processed_at timestamptz not null default now()
);

-- ───────────── Permisos y RLS ─────────────
revoke all on public.auctions, public.auction_bids, public.auction_watchers, public.auction_aliases, public.auction_notifications, public.auction_ticks, public.stripe_events from anon, authenticated;
grant all on public.auctions, public.auction_bids, public.auction_watchers, public.auction_aliases, public.auction_notifications, public.auction_ticks, public.stripe_events to service_role;
grant select, insert, update, delete on public.auctions to authenticated;          -- limitado por RLS a admin
grant select on public.auction_bids to authenticated;                               -- solo las propias / admin
grant select, insert, delete on public.auction_watchers to authenticated;           -- solo las propias
grant select on public.auction_ticks to anon, authenticated;
grant select on public.auction_notifications to authenticated;

alter table public.auctions enable row level security;
alter table public.auction_bids enable row level security;
alter table public.auction_watchers enable row level security;
alter table public.auction_aliases enable row level security;
alter table public.auction_notifications enable row level security;
alter table public.auction_ticks enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists "auctions admin all" on public.auctions;
create policy "auctions admin all" on public.auctions for all to authenticated
  using (public.is_jbu_admin()) with check (public.is_jbu_admin());

drop policy if exists "bids own or admin" on public.auction_bids;
create policy "bids own or admin" on public.auction_bids for select to authenticated
  using (user_id = auth.uid() or public.is_jbu_admin());

drop policy if exists "watchers own read" on public.auction_watchers;
create policy "watchers own read" on public.auction_watchers for select to authenticated using (user_id = auth.uid() or public.is_jbu_admin());
drop policy if exists "watchers own insert" on public.auction_watchers;
create policy "watchers own insert" on public.auction_watchers for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "watchers own delete" on public.auction_watchers;
create policy "watchers own delete" on public.auction_watchers for delete to authenticated using (user_id = auth.uid());

drop policy if exists "notifications own" on public.auction_notifications;
create policy "notifications own" on public.auction_notifications for select to authenticated using (user_id = auth.uid());

drop policy if exists "ticks public" on public.auction_ticks;
create policy "ticks public" on public.auction_ticks for select using (true);

-- ───────────── Vista pública (sin reserva ni identidades) ─────────────
create or replace view public.auctions_public as
select a.id, a.artwork_id, a.status, a.starts_at, a.ends_at, a.starting_bid, a.buy_now_price,
       a.minimum_increment, a.current_bid, a.bid_count, a.anti_sniping_enabled, a.extension_minutes,
       a.extended_count, a.sale_type, a.updated_at,
       (a.reserve_price is not null) as has_reserve,
       (a.reserve_price is null or coalesce(a.current_bid,0) >= a.reserve_price) as reserve_met,
       case when a.current_bid is null then a.starting_bid else a.current_bid + a.minimum_increment end as next_minimum_bid,
       now() as server_now
  from public.auctions a
 where a.status <> 'DRAFT';
grant select on public.auctions_public to anon, authenticated;

-- ───────────── Funciones ─────────────
create or replace function public.auction_set_updated() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists auctions_touch on public.auctions;
drop trigger if exists auctions_set_updated on public.auctions;
create trigger auctions_set_updated before update on public.auctions for each row execute function public.auction_set_updated();

create or replace function public.touch_auction_tick() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.auction_ticks(auction_id, updated_at) values (new.id, now())
  on conflict (auction_id) do update set updated_at = excluded.updated_at;
  return new;
end $$;
drop trigger if exists auctions_tick on public.auctions;
create trigger auctions_tick after insert or update on public.auctions for each row execute function public.touch_auction_tick();

-- Alias anónimo estable: Collector #NNN
create or replace function public.auction_alias_for(_user uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  select alias_number into n from public.auction_aliases where user_id = _user;
  if n is not null then return n; end if;
  loop
    n := 100 + floor(random() * 900)::int;
    if (select count(*) from public.auction_aliases) > 800 then n := 1000 + floor(random() * 9000)::int; end if;
    begin
      insert into public.auction_aliases(user_id, alias_number) values (_user, n);
      return n;
    exception when unique_violation then
      select alias_number into n from public.auction_aliases where user_id = _user;
      if n is not null then return n; end if;
    end;
  end loop;
end $$;
revoke all on function public.auction_alias_for(uuid) from public, anon, authenticated;

-- Cierra/activa subastas vencidas (idempotente)
create or replace function public.settle_auctions(_auction uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.auctions set status = 'LIVE'
   where status = 'UPCOMING' and starts_at <= now() and ends_at > now()
     and (_auction is null or id = _auction);

  update public.auctions a set
    status = case when a.bid_count > 0 and (a.reserve_price is null or a.current_bid >= a.reserve_price) then 'SOLD' else 'RESERVE_NOT_MET' end,
    winner_id = case when a.bid_count > 0 and (a.reserve_price is null or a.current_bid >= a.reserve_price) then a.current_bidder_id end,
    winning_amount = case when a.bid_count > 0 and (a.reserve_price is null or a.current_bid >= a.reserve_price) then a.current_bid end,
    sale_type = case when a.bid_count > 0 and (a.reserve_price is null or a.current_bid >= a.reserve_price) then 'BID' end,
    payment_status = case when a.bid_count > 0 and (a.reserve_price is null or a.current_bid >= a.reserve_price) then 'PENDING' else 'NONE' end,
    payment_due_at = case when a.bid_count > 0 and (a.reserve_price is null or a.current_bid >= a.reserve_price) then now() + make_interval(hours => a.payment_window_hours) end
   where a.status in ('LIVE','UPCOMING') and a.ends_at <= now()
     and (_auction is null or a.id = _auction);
end $$;
grant execute on function public.settle_auctions(uuid) to anon, authenticated;

-- Pujar: atómico, validado en el servidor
create or replace function public.place_bid(_auction uuid, _amount numeric)
returns table (ok boolean, message text, current_bid numeric, next_minimum numeric, ends_at timestamptz, extended boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  a public.auctions%rowtype;
  min_bid numeric;
  did_extend boolean := false;
begin
  if uid is null then
    return query select false, 'AUTH_REQUIRED', null::numeric, null::numeric, null::timestamptz, false; return;
  end if;
  perform public.settle_auctions(_auction);
  select * into a from public.auctions where id = _auction for update;
  if not found then return query select false, 'NOT_FOUND', null::numeric, null::numeric, null::timestamptz, false; return; end if;
  if a.status <> 'LIVE' or now() < a.starts_at or now() >= a.ends_at then
    return query select false, 'NOT_LIVE', a.current_bid, null::numeric, a.ends_at, false; return;
  end if;
  if exists (select 1 from public.artworks w where w.id = a.artwork_id and upper(coalesce(w.ownership_status::text,'')) <> 'AVAILABLE') then
    return query select false, 'NOT_AVAILABLE', a.current_bid, null::numeric, a.ends_at, false; return;
  end if;
  min_bid := case when a.current_bid is null then a.starting_bid else a.current_bid + a.minimum_increment end;
  if _amount is null or _amount < min_bid or _amount > 100000000 then
    return query select false, 'TOO_LOW', a.current_bid, min_bid, a.ends_at, false; return;
  end if;
  if a.current_bidder_id = uid then
    return query select false, 'ALREADY_LEADING', a.current_bid, min_bid, a.ends_at, false; return;
  end if;

  perform public.auction_alias_for(uid);
  insert into public.auction_bids(auction_id, user_id, amount) values (a.id, uid, round(_amount, 2));

  if a.anti_sniping_enabled and a.ends_at - now() <= make_interval(mins => a.extension_minutes) then
    a.ends_at := now() + make_interval(mins => a.extension_minutes);
    did_extend := true;
  end if;

  update public.auctions set
    current_bid = round(_amount, 2),
    current_bidder_id = uid,
    bid_count = bid_count + 1,
    original_ends_at = coalesce(original_ends_at, auctions.ends_at),
    ends_at = a.ends_at,
    extended_count = extended_count + case when did_extend then 1 else 0 end
  where id = a.id;

  -- prepara aviso "te superaron" para el anterior líder (canal pendiente)
  if a.current_bidder_id is not null then
    insert into public.auction_notifications(auction_id, user_id, kind) values (a.id, a.current_bidder_id, 'OUTBID')
    on conflict (auction_id, user_id, kind) do update set sent_at = null, created_at = now();
  end if;

  return query select true, 'OK', round(_amount, 2), round(_amount, 2) + a.minimum_increment, a.ends_at, did_extend;
end $$;
revoke all on function public.place_bid(uuid, numeric) from public, anon;
grant execute on function public.place_bid(uuid, numeric) to authenticated;

-- Historial público con alias
create or replace function public.auction_bid_history(_auction uuid, _limit integer default 30)
returns table (alias text, amount numeric, created_at timestamptz, is_mine boolean)
language sql stable security definer set search_path = public as $$
  select 'Collector #' || lpad(coalesce(al.alias_number, 0)::text, 3, '0'),
         b.amount, b.created_at, (b.user_id = auth.uid())
    from public.auction_bids b
    join public.auctions a on a.id = b.auction_id and a.status <> 'DRAFT'
    left join public.auction_aliases al on al.user_id = b.user_id
   where b.auction_id = _auction and b.status = 'VALID'
   order by b.amount desc, b.created_at desc
   limit least(greatest(_limit, 1), 100);
$$;
grant execute on function public.auction_bid_history(uuid, integer) to anon, authenticated;

-- Estado personal del usuario en una subasta
create or replace function public.my_auction_state(_auction uuid)
returns table (watching boolean, my_max numeric, is_leading boolean, won boolean, payment_status text, payment_due_at timestamptz)
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.auction_watchers w where w.auction_id = a.id and w.user_id = auth.uid()),
         (select max(amount) from public.auction_bids b where b.auction_id = a.id and b.user_id = auth.uid() and b.status = 'VALID'),
         (a.current_bidder_id = auth.uid() and a.status = 'LIVE'),
         (a.winner_id = auth.uid()),
         case when a.winner_id = auth.uid() then a.payment_status end,
         case when a.winner_id = auth.uid() then a.payment_due_at end
    from public.auctions a where a.id = _auction and auth.uid() is not null;
$$;
grant execute on function public.my_auction_state(uuid) to authenticated;

-- Subastas del coleccionista (siguiendo / pujando / ganadas)
create or replace function public.my_auctions()
returns table (auction_id uuid, artwork_id uuid, status text, ends_at timestamptz, current_bid numeric, bid_count integer,
               watching boolean, my_max numeric, is_leading boolean, won boolean, payment_status text, payment_due_at timestamptz, reserve_met boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.artwork_id, a.status, a.ends_at, a.current_bid, a.bid_count,
         exists (select 1 from public.auction_watchers w where w.auction_id = a.id and w.user_id = auth.uid()),
         (select max(amount) from public.auction_bids b where b.auction_id = a.id and b.user_id = auth.uid() and b.status = 'VALID'),
         (a.current_bidder_id = auth.uid()),
         (a.winner_id = auth.uid()),
         case when a.winner_id = auth.uid() then a.payment_status end,
         case when a.winner_id = auth.uid() then a.payment_due_at end,
         (a.reserve_price is null or coalesce(a.current_bid,0) >= a.reserve_price)
    from public.auctions a
   where a.status <> 'DRAFT' and auth.uid() is not null
     and (exists (select 1 from public.auction_watchers w where w.auction_id = a.id and w.user_id = auth.uid())
          or exists (select 1 from public.auction_bids b where b.auction_id = a.id and b.user_id = auth.uid()))
   order by a.ends_at desc;
$$;
grant execute on function public.my_auctions() to authenticated;

-- Admin: historial con correo y conteo de seguidores
create or replace function public.admin_auction_bids(_auction uuid)
returns table (alias text, email text, amount numeric, created_at timestamptz, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_jbu_admin() then raise exception 'forbidden'; end if;
  return query
  select 'Collector #' || lpad(coalesce(al.alias_number,0)::text, 3, '0'), u.email::text, b.amount, b.created_at, b.status
    from public.auction_bids b
    left join public.auction_aliases al on al.user_id = b.user_id
    left join auth.users u on u.id = b.user_id
   where b.auction_id = _auction
   order by b.amount desc, b.created_at desc;
end $$;
grant execute on function public.admin_auction_bids(uuid) to authenticated;

create or replace function public.admin_auction_watchers(_auction uuid) returns integer
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_jbu_admin() then raise exception 'forbidden'; end if;
  return (select count(*) from public.auction_watchers where auction_id = _auction);
end $$;
grant execute on function public.admin_auction_watchers(uuid) to authenticated;

-- Confirmación de venta (solo servidor / webhook). Idempotente y evita doble venta.
create or replace function public.complete_auction_sale(_auction uuid, _user uuid, _sale_type text, _amount numeric, _session text)
returns text language plpgsql security definer set search_path = public as $$
declare a public.auctions%rowtype;
begin
  select * into a from public.auctions where id = _auction for update;
  if not found then return 'NOT_FOUND'; end if;
  if a.payment_status = 'PAID' then return 'ALREADY_PAID'; end if;
  if _sale_type = 'BUY_NOW' then
    if a.status <> 'LIVE' and not (a.status = 'SOLD' and a.sale_type = 'BUY_NOW') then return 'NOT_OPEN'; end if;
    update public.auctions set status = 'SOLD', sale_type = 'BUY_NOW', winner_id = _user, winning_amount = _amount,
      payment_status = 'PAID', paid_at = now(), stripe_session_id = _session,
      original_ends_at = coalesce(original_ends_at, ends_at), ends_at = greatest(least(ends_at, now()), starts_at + interval '1 second')
     where id = _auction;
  else
    if a.status <> 'SOLD' or a.winner_id is distinct from _user then return 'NOT_WINNER'; end if;
    update public.auctions set payment_status = 'PAID', paid_at = now(), stripe_session_id = _session where id = _auction;
  end if;
  return 'OK';
end $$;
revoke all on function public.complete_auction_sale(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.complete_auction_sale(uuid, uuid, text, numeric, text) to service_role;

-- Tiempo real: solo la señal pública
do $$ begin
  alter publication supabase_realtime add table public.auction_ticks;
exception when others then null; end $$;

-- Cierre automático cada minuto (si pg_cron está activo)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('jbu-settle-auctions') where exists (select 1 from cron.job where jobname = 'jbu-settle-auctions');
    perform cron.schedule('jbu-settle-auctions', '* * * * *', 'select public.settle_auctions()');
  end if;
exception when others then null; end $$;

