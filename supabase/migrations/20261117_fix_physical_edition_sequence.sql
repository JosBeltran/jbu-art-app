-- JBU · HOTFIX 20261117: fix ambiguous PL/pgSQL n in edition unit generation.
-- Safe to run after the 20261114 foundation migration is already installed.
-- Only replaces the function; it does NOT alter data, orders, permissions,
-- inventory, sales state, or existing certificates.
begin;

create or replace function public.configure_physical_edition(
  _artwork_id uuid, _type text, _edition_size integer,
  _signed boolean default true, _description_es text default null,
  _description_en text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.artworks%rowtype;existing_allocated integer;begin
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
   select _artwork_id,edition_number,
    a.sku||'-'||lpad(edition_number::text,greatest(3,length(_edition_size::text)),'0')
    from generate_series(1,_edition_size) as gs(edition_number);
 end if;
 return jsonb_build_object('artwork_id',_artwork_id,'type',_type,
   'edition_size',case when _type='LIMITED_EDITION' then _edition_size else null end,
   'sales_enabled',false);
end $$;

commit;
