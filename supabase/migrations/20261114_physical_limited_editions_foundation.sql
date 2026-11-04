-- JBU physical limited editions: additive, non-selling foundation.
-- This migration intentionally does NOT activate checkout/COA for numbered units.
-- Requires user_roles / is_jbu_admin() (20261109).
begin;

alter table public.artworks
  add column if not exists physical_edition_type text not null default 'UNIQUE'
    check (physical_edition_type in ('UNIQUE','LIMITED_EDITION')),
  add column if not exists physical_edition_size integer
    check (physical_edition_size is null or physical_edition_size between 1 and 10000),
  add column if not exists physical_edition_signed boolean not null default true,
  add column if not exists physical_edition_description_es text,
  add column if not exists physical_edition_description_en text,
  add column if not exists physical_edition_sales_enabled boolean not null default false;

alter table public.artworks
  add constraint physical_edition_size_consistency
  check ((physical_edition_type = 'UNIQUE' and physical_edition_size is null)
      or (physical_edition_type = 'LIMITED_EDITION' and physical_edition_size is not null));

create table if not exists public.artwork_edition_units (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete restrict,
  edition_number integer not null check (edition_number > 0),
  unit_identifier text not null,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','RESERVED','SOLD')),
  order_item_id uuid references public.order_items(id) on delete restrict,
  certificate_id uuid references public.certificates(id) on delete restrict,
  created_at timestamptz not null default now(),
  reserved_at timestamptz,
  sold_at timestamptz,
  unique (artwork_id, edition_number),
  unique (unit_identifier),
  unique (order_item_id),
  unique (certificate_id),
  check (status <> 'SOLD' or (order_item_id is not null and sold_at is not null))
);

create index if not exists artwork_edition_units_artwork_status_idx
 on public.artwork_edition_units(artwork_id,status,edition_number);
alter table public.artwork_edition_units enable row level security;
revoke all on public.artwork_edition_units from public,anon,authenticated;
grant all on public.artwork_edition_units to service_role;
grant select on public.artwork_edition_units to authenticated;
create policy artwork_edition_units_admin_read on public.artwork_edition_units
 for select to authenticated using (public.is_jbu_admin());

-- Guard direct modifications: only the controlled admin RPC may change edition
-- configuration. Never re-key existing physical units from a routine artwork edit.
create or replace function public.guard_artwork_physical_edition()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op = 'UPDATE' and
    (new.physical_edition_type,new.physical_edition_size,new.physical_edition_signed,
     new.physical_edition_description_es,new.physical_edition_description_en,
     new.physical_edition_sales_enabled)
    is distinct from
    (old.physical_edition_type,old.physical_edition_size,old.physical_edition_signed,
     old.physical_edition_description_es,old.physical_edition_description_en,
     old.physical_edition_sales_enabled)
    and current_setting('jbu.physical_edition_configuration',true) is distinct from 'authorized'
 then raise exception 'physical_edition_requires_admin_rpc';end if;
 if tg_op = 'UPDATE' and old.physical_edition_type='LIMITED_EDITION'
    and new.sku is distinct from old.sku
 then raise exception 'physical_edition_sku_immutable';end if;
 return new;
end $$;
drop trigger if exists physical_edition_configuration_guard on public.artworks;
create trigger physical_edition_configuration_guard
 before update on public.artworks for each row execute function public.guard_artwork_physical_edition();

-- An admin may configure or resize only when no allocated unit exists.
-- This first phase creates the individual identities, but keeps sales disabled.
create or replace function public.configure_physical_edition(
  _artwork_id uuid, _type text, _edition_size integer,
  _signed boolean default true, _description_es text default null,
  _description_en text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.artworks%rowtype;n integer;existing_allocated integer;begin
 if not public.is_jbu_admin() then raise exception 'forbidden' using errcode='42501';end if;
 if _type not in ('UNIQUE','LIMITED_EDITION') or _type is null then raise exception 'invalid_edition_type';end if;
 if _type='LIMITED_EDITION' and (_edition_size is null or _edition_size not between 1 and 10000) then raise exception 'invalid_edition_size';end if;
 if length(coalesce(_description_es,''))>2000 or length(coalesce(_description_en,''))>2000 then raise exception 'description_too_long';end if;
 select * into a from public.artworks where id=_artwork_id for update;
 if not found then raise exception 'artwork_not_found';end if;
 select count(*) into existing_allocated from public.artwork_edition_units
  where artwork_id=_artwork_id and status<>'AVAILABLE';
 if existing_allocated>0 then raise exception 'edition_units_already_allocated';end if;
 if a.current_owner_id is not null or a.pending_owner_id is not null
   or a.ownership_status::text in ('SOLD','CLAIM_PENDING','CLAIMED','VERIFIED')
   or a.availability_status::text='SOLD'
   or exists(select 1 from public.certificates where artwork_id=_artwork_id)
 then raise exception 'owned_or_certified_artwork_cannot_change_edition';end if;
 if exists(select 1 from public.order_items where artwork_id=_artwork_id)
   or exists(select 1 from public.auctions where artwork_id=_artwork_id
     and (status in ('UPCOMING','LIVE') or (status='SOLD' and payment_status='PENDING')))
   or exists(select 1 from public.artwork_offers where artwork_id=_artwork_id
     and status::text='ACCEPTED' and payment_status='PENDING')
   or a.reserved_order_id is not null
 then raise exception 'artwork_has_sale_history_or_active_reservation';end if;
 perform set_config('jbu.physical_edition_configuration','authorized',true);
 delete from public.artwork_edition_units where artwork_id=_artwork_id;
 update public.artworks set
  physical_edition_type=_type,
  physical_edition_size=case when _type='LIMITED_EDITION' then _edition_size else null end,
  physical_edition_signed=coalesce(_signed,true),
  physical_edition_description_es=nullif(trim(_description_es),''),
  physical_edition_description_en=nullif(trim(_description_en),''),
  physical_edition_sales_enabled=false,
  updated_at=now()
 where id=_artwork_id;
 if _type='LIMITED_EDITION' then
  insert into public.artwork_edition_units(artwork_id,edition_number,unit_identifier)
   select _artwork_id,n,
    a.sku||'-'||lpad(n::text,greatest(3,length(_edition_size::text)),'0')
    from generate_series(1,_edition_size) as n;
 end if;
 return jsonb_build_object('artwork_id',_artwork_id,'type',_type,
   'edition_size',case when _type='LIMITED_EDITION' then _edition_size else null end,
   'sales_enabled',false);
end $$;
revoke all on function public.configure_physical_edition(uuid,text,integer,boolean,text,text) from public,anon;
grant execute on function public.configure_physical_edition(uuid,text,integer,boolean,text,text) to authenticated,service_role;

-- Safe public counters: never disclose buyer identity or order details.
create or replace function public.physical_edition_counts(_artwork_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('edition_size',a.physical_edition_size,
   'available',count(u.id) filter(where u.status='AVAILABLE'),
   'reserved',count(u.id) filter(where u.status='RESERVED'),
   'sold',count(u.id) filter(where u.status='SOLD'),
   'sales_enabled',a.physical_edition_sales_enabled)
 from public.artworks a left join public.artwork_edition_units u on u.artwork_id=a.id
 where a.id=_artwork_id and a.physical_edition_type='LIMITED_EDITION'
 group by a.id,a.physical_edition_size,a.physical_edition_sales_enabled
$$;
revoke all on function public.physical_edition_counts(uuid) from public;
grant execute on function public.physical_edition_counts(uuid) to anon,authenticated,service_role;

-- Prevent ANY existing sale path from claiming a limited-edition item as a
-- unique original (Stripe, offers, auctions, COD, or legacy direct writes).
-- Later transactional unit fulfillment must explicitly replace this gate.
create or replace function public.block_unimplemented_physical_edition_sales()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.artwork_id is not null and exists(
   select 1 from public.artworks where id=new.artwork_id
     and physical_edition_type='LIMITED_EDITION'
 ) then raise exception 'physical_edition_checkout_not_enabled';end if;
 return new;
end $$;
drop trigger if exists block_unimplemented_physical_edition_sales on public.order_items;
create trigger block_unimplemented_physical_edition_sales
 before insert on public.order_items for each row
 execute function public.block_unimplemented_physical_edition_sales();

commit;
