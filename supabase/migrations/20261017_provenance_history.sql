-- Provenance & Evolution: historial estructurado, append-only, idempotente.
-- Aditivo: reutiliza public.provenance_events (no borra ni renombra nada).

-- 1. event_type pasa de ENUM a texto (para nuevos tipos) si hace falta.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='provenance_events'
                and column_name='event_type' and data_type='USER-DEFINED') then
    alter table public.provenance_events alter column event_type type text using event_type::text;
  end if;
end $$;

alter table public.provenance_events add column if not exists title text;
alter table public.provenance_events add column if not exists description text;
alter table public.provenance_events add column if not exists event_date text;
alter table public.provenance_events add column if not exists date_precision text;
alter table public.provenance_events add column if not exists source text;
alter table public.provenance_events add column if not exists reference_type text;
alter table public.provenance_events add column if not exists reference_id text;
alter table public.provenance_events add column if not exists visibility text;
alter table public.provenance_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.provenance_events add column if not exists primary_image_url text;
alter table public.provenance_events add column if not exists amount_mxn numeric;
alter table public.provenance_events add column if not exists created_at timestamptz not null default now();
alter table public.provenance_events add column if not exists created_by uuid;
alter table public.provenance_events add column if not exists dedupe_key text;
alter table public.provenance_events add column if not exists show_sale_price_publicly boolean not null default false;

-- Registros previos: se conservan tal cual, marcados como LEGACY.
update public.provenance_events set source = 'LEGACY' where source is null;
-- Revalorizaciones por puntos y montos no son procedencia pública.
update public.provenance_events set visibility = 'ADMIN_ONLY'
 where visibility is null and (event_type in ('PRIMARY_SALE','PRICE_CHANGED') and description ilike '%Tier%');
update public.provenance_events set visibility = 'PUBLIC' where visibility is null;

alter table public.provenance_events alter column source set default 'MANUAL';
alter table public.provenance_events alter column visibility set default 'PUBLIC';
do $$ begin
  alter table public.provenance_events add constraint provenance_source_chk check (source in ('SYSTEM','MANUAL','LEGACY'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.provenance_events add constraint provenance_visibility_chk check (visibility in ('PUBLIC','PRIVATE','ADMIN_ONLY'));
exception when duplicate_object then null; end $$;

create unique index if not exists provenance_events_dedupe on public.provenance_events (dedupe_key) where dedupe_key is not null;
create index if not exists provenance_events_artwork_idx on public.provenance_events (artwork_id, created_at);

-- 2. Acceso: el público solo lee la vista segura; escritura solo servidor.
revoke all on public.provenance_events from anon, authenticated;
grant all on public.provenance_events to service_role;
alter table public.provenance_events enable row level security;

drop view if exists public.artwork_provenance_public;
create view public.artwork_provenance_public as
select p.id, p.artwork_id, p.event_type, p.event_date, p.date_precision, p.title, p.description,
       p.source, p.primary_image_url, p.created_at,
       case when p.show_sale_price_publicly then p.amount_mxn end as public_amount_mxn
  from public.provenance_events p
 where p.visibility = 'PUBLIC'
   and p.event_type not in ('PRICE_CHANGED','IMAGE_UPDATED','SEO_UPDATED','ARCHIVED','WITHDRAWN');
grant select on public.artwork_provenance_public to anon, authenticated;

-- 3. Inserción central idempotente.
create or replace function public.record_provenance(
  _artwork uuid, _type text, _title text, _description text,
  _event_date text default null, _precision text default null,
  _reference_type text default null, _reference_id text default null,
  _dedupe text default null, _visibility text default 'PUBLIC',
  _metadata jsonb default '{}'::jsonb, _source text default 'SYSTEM'
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if _artwork is null then return null; end if;
  insert into public.provenance_events(artwork_id, event_type, title, description, event_date, date_precision,
                                       reference_type, reference_id, dedupe_key, visibility, metadata, source)
  values (_artwork, _type, _title, _description, _event_date, _precision,
          _reference_type, _reference_id, _dedupe, coalesce(_visibility,'PUBLIC'), coalesce(_metadata,'{}'::jsonb), coalesce(_source,'SYSTEM'))
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.record_provenance(uuid,text,text,text,text,text,text,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.record_provenance(uuid,text,text,text,text,text,text,text,text,text,jsonb,text) to service_role;

-- Descripción de creación solo con datos reales de la obra.
create or replace function public.provenance_creation_text(_a jsonb) returns text
language plpgsql immutable as $$
declare parts text := 'Original work'; v text;
begin
  v := nullif(trim(coalesce(_a->>'series','')), '');
  if v is not null then parts := parts || ' from the ' || v || ' series'; end if;
  v := nullif(trim(coalesce(_a->>'medium_en', _a->>'medium', _a->>'technique_en', _a->>'technique', '')), '');
  if v is not null then parts := parts || ', ' || v; end if;
  v := nullif(trim(coalesce(_a->>'dimensions','')), '');
  if v is not null then parts := parts || ' · ' || v; end if;
  return parts || '.';
end $$;

create or replace function public.provenance_record_artwork_created(_a jsonb, _backfill boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare yr text := nullif(regexp_replace(coalesce(_a->>'year',''), '[^0-9]', '', 'g'), '');
begin
  if yr is not null and length(yr) = 4 then
    perform public.record_provenance((_a->>'id')::uuid, 'CREATED', 'Created in the JBU Studio',
      public.provenance_creation_text(_a), yr, 'YEAR', 'ARTWORK', _a->>'id', 'CREATED:' || (_a->>'id'));
  else
    perform public.record_provenance((_a->>'id')::uuid, 'CREATED', 'Artwork registered in the JBU archive',
      public.provenance_creation_text(_a), to_char(coalesce((_a->>'created_at')::timestamptz, now()), 'YYYY-MM-DD'),
      'RECORD', 'ARTWORK', _a->>'id', 'CREATED:' || (_a->>'id'));
  end if;
end $$;

-- 4. Triggers de sistema (no modifican la operación original; errores no la bloquean).
create or replace function public.trg_provenance_artworks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.provenance_record_artwork_created(to_jsonb(new));
    elsif new.certificate_hash is not null and new.certificate_hash is distinct from old.certificate_hash then
      perform public.record_provenance(new.id, 'CERTIFICATE_ISSUED', 'Digital Certificate of Authenticity issued',
        'The work was registered in the JBU certificate system with its unique authenticity record.',
        to_char(coalesce(new.certificate_issued_at::timestamptz, now()), 'YYYY-MM-DD'), 'DAY',
        'CERTIFICATE', new.id::text, 'CERTIFICATE_ISSUED:' || new.id || ':' || new.certificate_hash);
    end if;
  exception when others then raise warning 'provenance artworks: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists provenance_artworks on public.artworks;
create trigger provenance_artworks after insert or update of certificate_hash on public.artworks
  for each row execute function public.trg_provenance_artworks();

create or replace function public.provenance_record_lot(_auction uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select au.id, au.artwork_id, au.lot_number, au.status, e.id as event_id, e.name as event_title, e.status as event_status
    into a from public.auctions au join public.auction_events e on e.id = au.auction_event_id where au.id = _auction;
  if not found or a.status in ('DRAFT','CANCELLED') or a.event_status in ('DRAFT','CANCELLED') then return; end if;
  perform public.record_provenance(a.artwork_id, 'AUCTION_LOT_ADDED', 'Entered in ' || a.event_title,
    case when a.lot_number is not null then 'Selected as Lot ' || lpad(a.lot_number::text, 2, '0') || ' for ' || a.event_title || '.'
         else 'Selected as a lot for ' || a.event_title || '.' end,
    to_char(now(), 'YYYY-MM'), 'MONTH', 'AUCTION_EVENT', a.event_id::text,
    'AUCTION_LOT_ADDED:' || a.artwork_id || ':' || a.event_id,
    'PUBLIC', jsonb_build_object('lot_number', a.lot_number, 'auction_event_id', a.event_id));
end $$;

create or replace function public.trg_provenance_auctions() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev text; lot text;
begin
  begin
    if new.auction_event_id is not null then perform public.provenance_record_lot(new.id); end if;
    select e.name into ev from public.auction_events e where e.id = new.auction_event_id;
    lot := case when new.lot_number is not null then 'Lot ' || lpad(new.lot_number::text, 2, '0') end;
    if new.status = 'LIVE' and (tg_op = 'INSERT' or old.status is distinct from 'LIVE') then
      perform public.record_provenance(new.artwork_id, 'AUCTION_OPENED', 'Bidding opened',
        coalesce(lot, 'The work') || ' entered live online bidding' || coalesce(' as part of ' || ev, '') || '.',
        to_char(now(), 'YYYY-MM-DD'), 'DAY', 'AUCTION', new.id::text, 'AUCTION_OPENED:' || new.id,
        'PUBLIC', jsonb_build_object('auction_event_id', new.auction_event_id, 'lot_number', new.lot_number));
    elsif tg_op = 'UPDATE' and new.status in ('RESERVE_NOT_MET','ENDED') and old.status is distinct from new.status then
      perform public.record_provenance(new.artwork_id, 'AUCTION_ENDED',
        case when new.status = 'RESERVE_NOT_MET' and new.bid_count > 0 then 'Auction concluded — reserve not met' else 'Auction concluded' end,
        'The work completed its auction cycle' || coalesce(' in ' || ev, '') || ' without a sale.',
        to_char(now(), 'YYYY-MM-DD'), 'DAY', 'AUCTION', new.id::text, 'AUCTION_ENDED:' || new.id,
        'PUBLIC', jsonb_build_object('auction_event_id', new.auction_event_id, 'lot_number', new.lot_number));
    end if;
  exception when others then raise warning 'provenance auctions: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists provenance_auctions on public.auctions;
create trigger provenance_auctions after insert or update of status, auction_event_id, lot_number on public.auctions
  for each row execute function public.trg_provenance_auctions();

create or replace function public.trg_provenance_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  begin
    if new.status not in ('DRAFT','CANCELLED') and old.status in ('DRAFT') then
      for r in select id from public.auctions where auction_event_id = new.id loop
        perform public.provenance_record_lot(r.id);
      end loop;
    end if;
  exception when others then raise warning 'provenance events: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists provenance_auction_events on public.auction_events;
create trigger provenance_auction_events after update of status on public.auction_events
  for each row execute function public.trg_provenance_events();

-- 5. Migración segura de obras existentes (solo datos conocidos; nada inventado).
do $$
declare w record; r record;
begin
  for w in select a.* from public.artworks a
            where not exists (select 1 from public.provenance_events p
                               where p.artwork_id = a.id and p.event_type in ('CREATED','ARTWORK_RECORD_CREATED')) loop
    perform public.provenance_record_artwork_created(to_jsonb(w), true);
  end loop;
  -- Certificados ya emitidos sin registro previo (ni legado).
  for w in select a.* from public.artworks a
            where a.certificate_hash is not null
              and not exists (select 1 from public.provenance_events p where p.artwork_id = a.id
                               and (p.event_type = 'CERTIFICATE_ISSUED' or (p.source = 'LEGACY' and p.description ilike '%hash%'))) loop
    perform public.record_provenance(w.id, 'CERTIFICATE_ISSUED', 'Digital Certificate of Authenticity issued',
      'The work was registered in the JBU certificate system with its unique authenticity record.',
      case when w.certificate_issued_at is not null then to_char(w.certificate_issued_at::timestamptz, 'YYYY-MM-DD') end,
      case when w.certificate_issued_at is not null then 'DAY' end,
      'CERTIFICATE', w.id::text, 'CERTIFICATE_ISSUED:' || w.id || ':' || w.certificate_hash);
  end loop;
  -- Lotes ya publicados.
  for r in select au.id from public.auctions au join public.auction_events e on e.id = au.auction_event_id
            where e.status not in ('DRAFT','CANCELLED') and au.status not in ('DRAFT','CANCELLED') loop
    perform public.provenance_record_lot(r.id);
  end loop;
end $$;
