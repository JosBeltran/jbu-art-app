-- El Evento es la fuente de verdad del horario de sus lotes.
-- Inicio efectivo del lote  = greatest(lote.starts_at, evento.starts_at)        (ya existía: auction_effective_start)
-- Cierre base del lote      = evento.closing_starts_at (+ (lot_number-1) × intervalo si el cierre es secuencial)
-- Cierre efectivo           = cierre base, o la extensión anti-sniping de ESE lote si es posterior.
-- auctions.ends_at sigue siendo el valor que leen settle_auctions, place_bid, vistas y cuentas regresivas;
-- aquí se mantiene siempre sincronizado con el Evento (no se duplican campos).
-- Subastas independientes (auction_event_id null) no cambian.
-- Requiere 20261014, 20261015 y 20261018. Idempotente.

-- ───────────── 1. Cálculo único del cierre base ─────────────
create or replace function public.event_lot_base_end(_event uuid, _lot_number integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case
           when e.closing_starts_at is null then null
           when e.sequential_closing_enabled
             then e.closing_starts_at + make_interval(mins => (greatest(coalesce(_lot_number, 1), 1) - 1) * e.closing_interval_minutes)
           else e.closing_starts_at
         end
    from public.auction_events e where e.id = _event
$$;
grant execute on function public.event_lot_base_end(uuid, integer) to anon, authenticated;

-- ───────────── 2. Bitácora de correcciones (solo Admin) ─────────────
create table if not exists public.auction_timing_repairs (
  id uuid primary key default gen_random_uuid(),
  auction_event_id uuid references public.auction_events(id) on delete cascade,
  auction_id uuid references public.auctions(id) on delete cascade,
  lot_number integer,
  previous_ends_at timestamptz,
  corrected_ends_at timestamptz,
  previous_status text,
  new_status text,
  action text not null check (action in ('MOVED','REOPENED','FLAGGED_FINALIZED')),
  created_at timestamptz not null default now()
);
revoke all on public.auction_timing_repairs from anon, authenticated;
grant all on public.auction_timing_repairs to service_role;
grant select on public.auction_timing_repairs to authenticated;
alter table public.auction_timing_repairs enable row level security;
drop policy if exists "timing repairs admin read" on public.auction_timing_repairs;
create policy "timing repairs admin read" on public.auction_timing_repairs for select to authenticated using (public.is_jbu_admin());

-- ───────────── 3. Sincroniza los lotes con el Evento ─────────────
-- Abiertos (DRAFT/UPCOMING/LIVE): ends_at = cierre base, salvo extensión anti-sniping posterior de ese mismo lote.
-- Cerrados SIN venta (ENDED/RESERVE_NOT_MET, sin ganador ni pago) cuyo cierre base aún no llega: vuelven a UPCOMING.
-- Vendidos/pagados/con ganador: nunca se reabren; solo se registran para revisión del Admin.
create or replace function public.event_sync_lot_times(_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare e public.auction_events%rowtype; r record; base timestamptz; target timestamptz; n integer := 0;
begin
  select * into e from public.auction_events where id = _event;
  if not found or e.status = 'CANCELLED' or e.closing_starts_at is null then return 0; end if;

  for r in select * from public.auctions where auction_event_id = _event order by lot_number nulls last, lot_order nulls last for update loop
    base := public.event_lot_base_end(_event, coalesce(r.lot_number, r.lot_order));
    continue when base is null;
    -- Configuración inválida del lote (abre después del cierre del evento): no se toca.
    continue when base <= greatest(r.starts_at, e.starts_at);

    if r.status in ('DRAFT','UPCOMING','LIVE') then
      target := case when r.extended_count > 0 then greatest(base, r.ends_at) else base end;
      if target is distinct from r.ends_at then
        update public.auctions
           set ends_at = target,
               original_ends_at = case when r.bid_count > 0 then base else null end
         where id = r.id;
        insert into public.auction_timing_repairs(auction_event_id, auction_id, lot_number, previous_ends_at, corrected_ends_at, previous_status, new_status, action)
        values (_event, r.id, r.lot_number, r.ends_at, target, r.status, r.status, 'MOVED');
        n := n + 1;
      end if;

    elsif r.status in ('ENDED','RESERVE_NOT_MET')
          and r.winner_id is null and r.sale_type is null and coalesce(r.payment_status, 'NONE') = 'NONE'
          and base > now() and r.ends_at < base
          and not exists (select 1 from public.auctions o where o.artwork_id = r.artwork_id and o.id <> r.id and o.status in ('UPCOMING','LIVE'))
          and exists (select 1 from public.artworks w where w.id = r.artwork_id and upper(coalesce(w.ownership_status::text,'')) = 'AVAILABLE') then
      -- Cerró solo por el horario obsoleto: se corrige. settle_auctions lo pasa a LIVE si el evento ya abrió.
      update public.auctions
         set status = 'UPCOMING', ends_at = base,
             original_ends_at = case when r.bid_count > 0 then base else null end
       where id = r.id;
      insert into public.auction_timing_repairs(auction_event_id, auction_id, lot_number, previous_ends_at, corrected_ends_at, previous_status, new_status, action)
      values (_event, r.id, r.lot_number, r.ends_at, base, r.status, 'UPCOMING', 'REOPENED');
      n := n + 1;

    elsif r.status = 'SOLD' and r.ends_at < base and base > now()
          and not exists (select 1 from public.auction_timing_repairs x where x.auction_id = r.id and x.action = 'FLAGGED_FINALIZED') then
      insert into public.auction_timing_repairs(auction_event_id, auction_id, lot_number, previous_ends_at, corrected_ends_at, previous_status, new_status, action)
      values (_event, r.id, r.lot_number, r.ends_at, null, r.status, r.status, 'FLAGGED_FINALIZED');
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.event_sync_lot_times(uuid) from public, anon, authenticated;

-- ───────────── 4. Un lote de evento nunca puede cerrar antes que su Evento ─────────────
-- Cubre altas, ediciones de lote, asignación a evento y renumeración. Solo puede subir ends_at (anti-sniping intacto).
create or replace function public.auctions_apply_event_window() returns trigger
language plpgsql security definer set search_path = public as $$
declare base timestamptz;
begin
  if new.auction_event_id is null or new.status not in ('DRAFT','UPCOMING','LIVE') then return new; end if;
  base := public.event_lot_base_end(new.auction_event_id, coalesce(new.lot_number, new.lot_order));
  if base is not null and new.ends_at < base then new.ends_at := base; end if;
  return new;
end $$;
drop trigger if exists auctions_apply_event_window on public.auctions;
-- El nombre ordena antes que auctions_validate_effective_window, que valida el valor ya corregido.
create trigger auctions_apply_event_window
  before insert or update of status, ends_at, auction_event_id, lot_number, lot_order on public.auctions
  for each row execute function public.auctions_apply_event_window();

-- ───────────── 5. Cambiar horarios del Evento se propaga solo ─────────────
create or replace function public.auction_events_propagate_timing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.event_sync_lot_times(new.id);
  perform public.settle_auctions(null);  -- abre / regresa a "Próximo" según el nuevo inicio efectivo
  return new;
end $$;
drop trigger if exists auction_events_propagate_timing on public.auction_events;
create trigger auction_events_propagate_timing
  after update of starts_at, closing_starts_at, sequential_closing_enabled, closing_interval_minutes, status on public.auction_events
  for each row execute function public.auction_events_propagate_timing();

-- La validación del inicio del evento ahora usa el cierre que tendrá cada lote tras la propagación.
create or replace function public.validate_event_lots_window() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.auctions a
     where a.auction_event_id = new.id and a.status in ('UPCOMING','LIVE')
       and coalesce(
             case when new.closing_starts_at is null then null
                  when new.sequential_closing_enabled
                    then new.closing_starts_at + make_interval(mins => (greatest(coalesce(a.lot_number, a.lot_order, 1), 1) - 1) * new.closing_interval_minutes)
                  else new.closing_starts_at end,
             a.ends_at) <= greatest(a.starts_at, new.starts_at)) then
    raise exception 'LOT_END_BEFORE_EFFECTIVE_START: Lot closing time must be later than its effective opening time.';
  end if;
  return new;
end $$;
drop trigger if exists auction_events_validate_lots_window on public.auction_events;
create trigger auction_events_validate_lots_window
  before update of starts_at, closing_starts_at, sequential_closing_enabled, closing_interval_minutes on public.auction_events
  for each row execute function public.validate_event_lots_window();

-- ───────────── 6. Programación del Admin: misma regla, también con pujas ─────────────
create or replace function public.admin_event_apply_schedule(_event uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_jbu_admin() then raise exception 'forbidden'; end if;
  perform 1 from public.auction_events where id = _event for update;
  if not found then raise exception 'not found'; end if;
  update public.auctions set lot_number = null where auction_event_id = _event;
  for r in select id from public.auctions where auction_event_id = _event order by lot_order nulls last, created_at for update loop
    n := n + 1;
    update public.auctions set lot_number = n, lot_order = n where id = r.id;
  end loop;
  return public.event_sync_lot_times(_event);
end $$;
grant execute on function public.admin_event_apply_schedule(uuid) to authenticated;

-- ───────────── 7. Reparación de datos existentes ─────────────
do $$
declare ev record;
begin
  for ev in select id from public.auction_events where status <> 'CANCELLED' and closing_starts_at is not null loop
    perform public.event_sync_lot_times(ev.id);
  end loop;
  perform public.settle_auctions(null);
end $$;

-- Reporte (ejecutar después):
-- select e.name, e.starts_at as event_start, e.closing_starts_at as lot_closing_starts,
--        r.lot_number, r.previous_ends_at, r.corrected_ends_at, r.previous_status, a.status as resulting_status, r.action
--   from public.auction_timing_repairs r join public.auction_events e on e.id = r.auction_event_id
--   join public.auctions a on a.id = r.auction_id order by e.name, r.lot_number;
