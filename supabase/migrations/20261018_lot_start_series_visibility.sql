-- Dos correcciones funcionales, aditivas y seguras de repetir.
-- 1) Un lote nunca abre antes que su evento: inicio efectivo = greatest(lote.starts_at, evento.starts_at).
--    No se sobreescribe auctions.starts_at; se deriva.
-- 2) El estado de la Serie controla la visibilidad pública de sus obras (vista artworks_discoverable).
-- Requiere 20261013, 20261014 y 20261015.

-- ───────────── 1. Inicio efectivo del lote ─────────────
create or replace function public.auction_effective_start(_auction uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(a.starts_at, coalesce(e.starts_at, a.starts_at))
    from public.auctions a left join public.auction_events e on e.id = a.auction_event_id
   where a.id = _auction
$$;
grant execute on function public.auction_effective_start(uuid) to anon, authenticated;

create or replace function public.settle_auctions(_auction uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Apertura: respeta el inicio del evento padre (inicio efectivo = el mayor de ambos)
  update public.auctions set status = 'LIVE'
   where status = 'UPCOMING' and public.auction_effective_start(id) <= now() and ends_at > now()
     and (_auction is null or id = _auction);

  -- Corrección: un lote sin pujas que abrió antes que su evento vuelve a "Próximo"
  update public.auctions set status = 'UPCOMING'
   where status = 'LIVE' and bid_count = 0 and now() < public.auction_effective_start(id) and ends_at > now()
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
  -- Un lote nunca acepta pujas antes de su evento padre
  select * into a from public.auctions where id = _auction for update;
  if not found then return query select false, 'NOT_FOUND', null::numeric, null::numeric, null::timestamptz, false; return; end if;
  if a.status <> 'LIVE' or now() < public.auction_effective_start(a.id) or now() >= a.ends_at then
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

-- Vista pública: starts_at ahora es el inicio EFECTIVO (cuentas regresivas y estado correctos en todo el sitio).
-- El valor configurado del lote queda en configured_starts_at (columna nueva al final).
create or replace view public.auctions_public as
select a.id, a.artwork_id,
       case when a.status = 'LIVE' and now() < greatest(a.starts_at, coalesce(ev.starts_at, a.starts_at)) then 'UPCOMING' else a.status end as status,
       greatest(a.starts_at, coalesce(ev.starts_at, a.starts_at)) as starts_at, a.ends_at, a.starting_bid, a.buy_now_price,
       a.minimum_increment, a.current_bid, a.bid_count, a.anti_sniping_enabled, a.extension_minutes,
       a.extended_count, a.sale_type, a.updated_at,
       (a.reserve_price is not null) as has_reserve,
       (a.reserve_price is null or coalesce(a.current_bid,0) >= a.reserve_price) as reserve_met,
       case when a.current_bid is null then a.starting_bid else a.current_bid + a.minimum_increment end as next_minimum_bid,
       now() as server_now,
       a.auction_event_id, a.lot_number, a.original_ends_at,
       a.starts_at as configured_starts_at
  from public.auctions a
  left join public.auction_events ev on ev.id = a.auction_event_id
 where a.status <> 'DRAFT';
grant select on public.auctions_public to anon, authenticated;

-- No se puede publicar/activar un lote que cierra antes de su apertura efectiva.
create or replace function public.validate_lot_effective_window() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev_start timestamptz;
begin
  if new.status not in ('UPCOMING','LIVE') then return new; end if;
  select starts_at into ev_start from public.auction_events where id = new.auction_event_id;
  if new.ends_at <= greatest(new.starts_at, coalesce(ev_start, new.starts_at)) then
    raise exception 'LOT_END_BEFORE_EFFECTIVE_START: Lot closing time must be later than its effective opening time.';
  end if;
  return new;
end $$;
drop trigger if exists auctions_validate_effective_window on public.auctions;
create trigger auctions_validate_effective_window
  before insert or update of status, starts_at, ends_at, auction_event_id on public.auctions
  for each row execute function public.validate_lot_effective_window();

create or replace function public.validate_event_lots_window() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.auctions a
              where a.auction_event_id = new.id and a.status in ('UPCOMING','LIVE')
                and a.ends_at <= greatest(a.starts_at, new.starts_at)) then
    raise exception 'LOT_END_BEFORE_EFFECTIVE_START: Lot closing time must be later than its effective opening time.';
  end if;
  return new;
end $$;
drop trigger if exists auction_events_validate_lots_window on public.auction_events;
create trigger auction_events_validate_lots_window
  before update of starts_at on public.auction_events
  for each row execute function public.validate_event_lots_window();

-- Aplica de inmediato la regla a lotes ya abiertos antes de su evento (solo si no tienen pujas).
select public.settle_auctions(null);

-- ───────────── 2. Visibilidad heredada de la Serie ─────────────
-- coming_soon (Próximamente) oculta sus obras del descubrimiento público, salvo lanzamiento automático vencido.
-- active / outlet / archived conservan su comportamiento actual. No se modifica ninguna obra.
create or replace function public.series_allows_discovery(_status text, _auto_launch boolean, _launch_date timestamptz)
returns boolean language sql stable as $$
  select not (coalesce(_status,'active') = 'coming_soon'
              and not (coalesce(_auto_launch,false) and _launch_date is not null and _launch_date <= now()))
$$;
grant execute on function public.series_allows_discovery(text, boolean, timestamptz) to anon, authenticated;

-- security_invoker: respeta exactamente las políticas RLS existentes de artworks (no las debilita).
create or replace view public.artworks_discoverable with (security_invoker = true) as
select a.*
  from public.artworks a
  left join public.series s on s.id = a.series_id
 where s.id is null or public.series_allows_discovery(s.editorial_status, s.auto_launch, s.launch_date);
grant select on public.artworks_discoverable to anon, authenticated;

