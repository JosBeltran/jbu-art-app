-- Edition presentation and management. No edition is activated by this migration.
begin;

alter table public.artworks
  alter column physical_edition_signed set default false,
  add column physical_edition_made_to_order boolean not null default false,
  add column physical_edition_frame_es text,
  add column physical_edition_frame_en text,
  add column physical_edition_signature_confirmed boolean not null default false,
  add column physical_edition_sales_activated_at timestamptz;

create or replace function public.configure_physical_edition(
  _artwork_id uuid, _type text, _edition_size integer,
  _signed boolean default false, _description_es text default null,
  _description_en text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.artworks%rowtype;existing_allocated integer;begin
 if not public.is_jbu_admin() then raise exception 'forbidden' using errcode='42501';end if;
 if _type not in ('UNIQUE','LIMITED_EDITION') or _type is null then raise exception 'invalid_edition_type';end if;
 if _type='LIMITED_EDITION' and (_edition_size is null or _edition_size not between 1 and 10000) then raise exception 'invalid_edition_size';end if;
 if length(coalesce(_description_es,''))>2000 or length(coalesce(_description_en,''))>2000 then raise exception 'description_too_long';end if;
 select * into a from public.artworks where id=_artwork_id for update;
 if not found then raise exception 'artwork_not_found';end if;
 -- Description edits keep the inventory and sales switch. Signature changes
 -- are allowed only before an order or reservation commits to the specification.
 if a.physical_edition_type = _type and a.physical_edition_size is not distinct from
    (case when _type='LIMITED_EDITION' then _edition_size else null end)
 then
  if (a.physical_edition_signed and a.physical_edition_signature_confirmed) is distinct from coalesce(_signed,false)
     and exists(select 1 from public.physical_edition_checkout_holds
       where artwork_id=_artwork_id and status in ('HELD','PAID'))
  then raise exception 'edition_signature_locked';end if;
  perform set_config('jbu.physical_edition_configuration','authorized',true);
  update public.artworks set physical_edition_signed=coalesce(_signed,false),
    physical_edition_description_es=nullif(trim(_description_es),''),
    physical_edition_description_en=nullif(trim(_description_en),''),updated_at=now()
  where id=_artwork_id;
  return jsonb_build_object('artwork_id',_artwork_id,'type',_type,
    'edition_size',a.physical_edition_size,'sales_enabled',a.physical_edition_sales_enabled);
 end if;
 if a.physical_edition_sales_enabled then raise exception 'pause_edition_first';end if;

 select count(*) into existing_allocated from public.artwork_edition_units
  where artwork_id=_artwork_id and status<>'AVAILABLE';
 if existing_allocated>0 or exists(select 1 from public.physical_edition_checkout_holds where artwork_id=_artwork_id)
 then raise exception 'edition_units_already_allocated';end if;
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
  physical_edition_signed=coalesce(_signed,false),
  physical_edition_description_es=nullif(trim(_description_es),''),
  physical_edition_description_en=nullif(trim(_description_en),''),
  physical_edition_sales_enabled=false,physical_edition_sales_activated_at=null,
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

create function public.save_physical_edition(
 _artwork uuid,_type text,_size integer,_signed boolean,_description_es text,_description_en text,
 _made_to_order boolean,_frame_es text,_frame_en text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if length(coalesce(_frame_es,''))>240 or length(coalesce(_frame_en,''))>240
 then raise exception 'invalid_edition_framing';end if;
 result:=public.configure_physical_edition(_artwork,_type,_size,_signed,_description_es,_description_en);
 update public.artworks set
   physical_edition_signature_confirmed=_type='LIMITED_EDITION' and coalesce(_signed,false),
   physical_edition_made_to_order=_type='LIMITED_EDITION' and coalesce(_made_to_order,false),
   physical_edition_frame_es=case when _type='LIMITED_EDITION' then nullif(trim(_frame_es),'') end,
   physical_edition_frame_en=case when _type='LIMITED_EDITION' then nullif(trim(_frame_en),'') end
 where id=_artwork;
 return result;
end $$;
revoke all on function public.save_physical_edition(uuid,text,integer,boolean,text,text,boolean,text,text) from public,anon;
grant execute on function public.save_physical_edition(uuid,text,integer,boolean,text,text,boolean,text,text) to authenticated;

-- Shared effective publication rule for catalog sales and direct checkout.
create function public.physical_edition_is_published(a public.artworks)
returns boolean language sql stable set search_path=public as $$
 select a.status::text in ('AVAILABLE','OWNED') and not coalesce(a.is_historical_version,false)
  and (a.series_id is null or exists(select 1 from public.series s where s.id=a.series_id))
  and not exists(select 1 from public.series s
    where (s.id=a.series_id or (a.series_id is null and upper(trim(s.title))=upper(trim(a.series))))
    and not public.series_allows_discovery(s.editorial_status,s.auto_launch,s.launch_date))
$$;
revoke all on function public.physical_edition_is_published(public.artworks) from public,anon,authenticated;
grant execute on function public.physical_edition_is_published(public.artworks) to service_role;

create or replace function public.physical_edition_counts(_artwork_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('edition_size',a.physical_edition_size,
   'available',count(u.id) filter(where u.status='AVAILABLE'),
   'reserved',count(u.id) filter(where u.status='RESERVED'),
   'sold',count(u.id) filter(where u.status='SOLD'),
   'sales_enabled',a.physical_edition_sales_enabled)
 from public.artworks a left join public.artwork_edition_units u on u.artwork_id=a.id
 where a.id=_artwork_id and a.physical_edition_type='LIMITED_EDITION'
   and (public.physical_edition_is_published(a) or public.is_jbu_admin())
 group by a.id
$$;

-- Public routes ask only for counts of their already-visible artwork IDs.
create function public.physical_edition_counts_batch(_ids uuid[])
returns table(artwork_id uuid, edition_size integer, available integer, reserved integer, sold integer, sales_enabled boolean)
language sql stable set search_path=public as $$
 select a.id,a.physical_edition_size,
   count(u.id) filter(where u.status='AVAILABLE')::integer,
   count(u.id) filter(where u.status='RESERVED')::integer,
   count(u.id) filter(where u.status='SOLD')::integer,a.physical_edition_sales_enabled
 from public.artworks a left join public.artwork_edition_units u on u.artwork_id=a.id
 where a.id=any(_ids) and a.physical_edition_type='LIMITED_EDITION'
 group by a.id
$$;
revoke all on function public.physical_edition_counts_batch(uuid[]) from public,anon,authenticated;
grant execute on function public.physical_edition_counts_batch(uuid[]) to service_role;

create function public.physical_edition_readiness(_artwork uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare a public.artworks%rowtype; unit_count integer; available_count integer; shipping_ok boolean;
begin
 if not public.is_jbu_admin() then raise exception 'forbidden' using errcode='42501';end if;
 select * into a from public.artworks where id=_artwork;
 if not found then raise exception 'artwork_not_found';end if;
 select count(*),count(*) filter(where status='AVAILABLE')
 into unit_count,available_count from public.artwork_edition_units where artwork_id=a.id;
 select exists(
   select 1 from public.site_settings s cross join public.shipping_policies p
   cross join lateral unnest(s.global_shipping_countries) market(country)
   where s.id=true and p.active and p.method<>'QUOTE_REQUIRED' and cardinality(p.postal_codes)=0
   and (coalesce(cardinality(a.allowed_shipping_countries),0)=0 or market.country=any(a.allowed_shipping_countries))
   and (cardinality(p.countries)=0 or market.country=any(p.countries))
   and (case when cardinality(a.shipping_policy_ids)>0 then p.id=any(a.shipping_policy_ids)
        else coalesce(s.default_shipping_policies->'original' ? p.id::text,false) end)
 ) into shipping_ok;
 return jsonb_build_object(
  'edition',a.physical_edition_type='LIMITED_EDITION' and coalesce(a.physical_edition_size>0,false),
  'inventory',unit_count>0 and unit_count=a.physical_edition_size,
  'stock',available_count>0,
  'publication',coalesce(a.status::text='AVAILABLE' and a.availability_status::text='AVAILABLE',false)
    and public.physical_edition_is_published(a),
  'price',coalesce(a.price_display_mode,'SHOW_PRICE')='SHOW_PRICE'
          and coalesce(nullif(a.base_price_mxn,0),a.calculated_price_mxn,0)>0,
  'ownership',a.current_owner_id is null and a.pending_owner_id is null and a.reserved_order_id is null,
  'auction',not exists(select 1 from public.auctions where artwork_id=a.id
       and (status in ('UPCOMING','LIVE') or (status='SOLD' and payment_status='PENDING'))),
  'offer',not exists(select 1 from public.artwork_offers where artwork_id=a.id
       and status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at>now()),
  'shipping',shipping_ok,
  'checkout',to_regprocedure('public.create_physical_edition_checkout_hold(uuid,uuid,uuid)') is not null
     and to_regprocedure('public.fulfill_physical_edition_checkout(uuid,text,text,text,text,text,jsonb,numeric)') is not null,
  'certificates',to_regprocedure('public.attach_physical_edition_certificate_pdf(uuid,text,text)') is not null
     and to_regprocedure('public.issue_physical_edition_certificate(uuid,uuid,timestamptz,text,jsonb)') is not null
 );
end $$;
revoke all on function public.physical_edition_readiness(uuid) from public,anon;
grant execute on function public.physical_edition_readiness(uuid) to authenticated;

create or replace function public.set_physical_edition_sales_enabled(_artwork uuid,_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.artworks%rowtype; checks jsonb; blockers text;
begin
 if not public.is_jbu_admin() then raise exception 'forbidden' using errcode='42501';end if;
 if _enabled is null then raise exception 'invalid_sales_setting';end if;
 select * into a from public.artworks where id=_artwork for update;
 if not found or a.physical_edition_type<>'LIMITED_EDITION' then raise exception 'edition_not_found';end if;
 if _enabled then
  checks:=public.physical_edition_readiness(_artwork);
  select string_agg(key,',' order by key) into blockers from jsonb_each(checks) where value<>'true'::jsonb;
  if blockers is not null then raise exception 'edition_not_ready_for_sales' using detail=blockers;end if;
 end if;
 perform set_config('jbu.physical_edition_configuration','authorized',true);
 update public.artworks set physical_edition_sales_enabled=_enabled,
   physical_edition_sales_activated_at=case when _enabled or a.physical_edition_sales_enabled
      then coalesce(a.physical_edition_sales_activated_at,now()) else a.physical_edition_sales_activated_at end,
   updated_at=now() where id=_artwork;
 return jsonb_build_object('artwork_id',_artwork,'sales_enabled',_enabled);
end $$;

-- A collector gets only units sold on their paid Auth-ID-bound orders.
create function public.collector_physical_editions(_collector uuid)
returns table(
 id uuid, order_item_id uuid, order_id uuid, order_status text, unit_identifier text,
 edition_number integer, edition_size integer, sku text, title text, title_en text,
 artist text, medium text, medium_en text, dimensions text, primary_image_url text,
 certificate_sku text, pdf_ready boolean
)
language sql stable security definer set search_path=public as $$
 select u.id,i.id,o.id,o.status::text,u.unit_identifier,u.edition_number,a.physical_edition_size,
   a.sku,a.title,a.title_en,coalesce(nullif(p.full_name,''),c.artist),a.medium,a.medium_en,
   a.dimensions,coalesce(a.primary_image_url,c.primary_image_url),c.sku,c.pdf_hash is not null
 from public.orders o join public.order_items i on i.order_id=o.id
 join public.artwork_edition_units u on u.id=i.physical_edition_unit_id and u.order_item_id=i.id
 join public.artworks a on a.id=u.artwork_id
 left join public.profiles p on p.id=a.artist_profile_id
 left join public.physical_edition_certificates c on c.unit_id=u.id and c.owner_id=o.buyer_user_id and c.status='ISSUED'
 where o.buyer_user_id=_collector and (auth.uid()=_collector or auth.role()='service_role')
   and o.payment_status='PAID' and u.status='SOLD'
 order by u.sold_at desc,u.id
$$;
revoke all on function public.collector_physical_editions(uuid) from public,anon;
grant execute on function public.collector_physical_editions(uuid) to authenticated,service_role;

create function public.physical_edition_inventory(_artwork uuid,_status text,_offset integer,_limit integer)
returns table(
 id uuid, edition_number integer, unit_identifier text, status text, order_id uuid,
 collector text, certificate_sku text, created_at timestamptz, reserved_at timestamptz, sold_at timestamptz
)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.is_jbu_admin() then raise exception 'forbidden' using errcode='42501';end if;
 return query select u.id,u.edition_number,u.unit_identifier,u.status,o.id,o.buyer_name,c.sku,
   u.created_at,u.reserved_at,u.sold_at
 from public.artwork_edition_units u
 left join public.order_items i on i.id=u.order_item_id
 left join public.orders o on o.id=i.order_id
 left join public.physical_edition_certificates c on c.id=u.physical_certificate_id
 where u.artwork_id=_artwork and (_status is null or u.status=_status)
 order by u.edition_number offset greatest(_offset,0) limit least(greatest(_limit,1),100);
end $$;
revoke all on function public.physical_edition_inventory(uuid,text,integer,integer) from public,anon;
grant execute on function public.physical_edition_inventory(uuid,text,integer,integer) to authenticated;

create or replace function public.create_physical_edition_checkout_hold(
 _artwork_id uuid,_buyer uuid,_request_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.artworks%rowtype;u public.artwork_edition_units%rowtype;
 existing public.physical_edition_checkout_holds%rowtype;
 amount numeric;new_hold uuid;hold_expires timestamptz:=now()+interval '35 minutes';begin
 if _artwork_id is null or _buyer is null or _request_key is null then
  raise exception 'invalid_edition_checkout';end if;
 -- Serialize simultaneous requests from the same buyer for this edition.
 perform pg_advisory_xact_lock(hashtextextended(_artwork_id::text||':'||_buyer::text,0));
 select * into existing from public.physical_edition_checkout_holds where request_key=_request_key for update;
 if found then
  if existing.artwork_id<>_artwork_id or existing.buyer_user_id<>_buyer then raise exception 'request_key_conflict';end if;
  if existing.status='HELD' and existing.expires_at>now() then
   return jsonb_build_object('id',existing.id,'unit_id',existing.unit_id,'amount_mxn',existing.quote_mxn,
     'stripe_session_id',existing.stripe_session_id,'expires_at',existing.expires_at,'existing',true);end if;
  raise exception 'checkout_request_not_reusable';
 end if;
 if not exists(select 1 from auth.users where id=_buyer and email_confirmed_at is not null)
 then raise exception 'verified_buyer_required';end if;
 -- A single verified buyer cannot lock multiple units in parallel from
 -- the same edition; retries use the same idempotent request key.
 if exists(select 1 from public.physical_edition_checkout_holds
   where artwork_id=_artwork_id and buyer_user_id=_buyer and status='HELD') then
   raise exception 'edition_checkout_already_open';
 end if;
 select * into a from public.artworks where id=_artwork_id for update;
 if not found or a.physical_edition_type<>'LIMITED_EDITION' or
     not public.physical_edition_is_published(a) or
     not a.physical_edition_sales_enabled or a.availability_status::text is distinct from 'AVAILABLE' or
     a.status::text<>'AVAILABLE' or coalesce(a.price_display_mode,'SHOW_PRICE')<>'SHOW_PRICE' or
     a.current_owner_id is not null or a.pending_owner_id is not null or
     a.reserved_order_id is not null
 then raise exception 'edition_not_for_sale';end if;
 if exists(select 1 from public.auctions where artwork_id=a.id and
  (status in ('UPCOMING','LIVE') or (status='SOLD' and payment_status='PENDING')))
  or exists(select 1 from public.artwork_offers where artwork_id=a.id and
   status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at>now())
 then raise exception 'edition_has_exclusive_payment';end if;
 amount:=coalesce(nullif(a.base_price_mxn,0),a.calculated_price_mxn,0);
 if amount<=0 then raise exception 'invalid_edition_price';end if;
 select * into u from public.artwork_edition_units
  where artwork_id=_artwork_id and status='AVAILABLE'
  order by edition_number limit 1 for update skip locked;
 if not found then raise exception 'edition_sold_out_or_reserved';end if;
 insert into public.physical_edition_checkout_holds
  (artwork_id,unit_id,buyer_user_id,request_key,quote_mxn,expires_at)
 values(_artwork_id,u.id,_buyer,_request_key,amount,hold_expires)
 returning id into new_hold;
 update public.artwork_edition_units set status='RESERVED',reserved_at=now() where id=u.id;
 return jsonb_build_object('id',new_hold,'unit_id',u.id,'unit_identifier',u.unit_identifier,
  'amount_mxn',amount,'expires_at',hold_expires,'existing',false);
end $$;

commit;
