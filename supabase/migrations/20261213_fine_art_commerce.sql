begin;
alter table public.products drop constraint products_status_check;
alter table public.products add constraint products_status_check
  check(status in ('draft','configuring','pending_review','ready','approved','published','unpublished','archived'));
insert into public.product_attributes(code,label_es,label_en,value_type,measurement_unit)
values('frame_color','Color del marco','Frame color','string',null),
  ('mat','Paspartú','Mount','string',null)
on conflict (code) do nothing;
insert into public.product_family_attributes(family_code,attribute_code)
select 'framed_print',code from unnest(array['frame_color','mat']) as code
on conflict do nothing;

-- Ordinary storage clients cannot overwrite verified commercial uploads.
create policy deny_commercial_art_insert on storage.objects as restrictive for insert to anon,authenticated
with check (bucket_id <> 'artworks' or name not like 'commercial-prints/%');
create policy deny_commercial_art_update on storage.objects as restrictive for update to anon,authenticated
using (bucket_id <> 'artworks' or name not like 'commercial-prints/%')
with check (bucket_id <> 'artworks' or name not like 'commercial-prints/%');
create policy deny_commercial_art_delete on storage.objects as restrictive for delete to anon,authenticated
using (bucket_id <> 'artworks' or name not like 'commercial-prints/%');

alter table public.product_variant_assets
  add column alt_es text, add column alt_en text,
  add column source text check(source in ('admin','jbu','provider')),
  add column configuration_snapshot jsonb,
  add column verified_at timestamptz, add column verified_by uuid;
alter table public.product_variants add column replaces_print_id uuid references public.artwork_prints(id);
create unique index active_product_print_replacement on public.product_variants(replaces_print_id)
  where replaces_print_id is not null and status='active';

create function public.fine_art_image_configuration(_variant uuid)
returns jsonb language sql stable set search_path=public as $$
select jsonb_build_object(
  'attributes',coalesce((select jsonb_agg(jsonb_build_object('code',attribute_code,
    'value',coalesce(to_jsonb(text_value),to_jsonb(number_value),to_jsonb(boolean_value),to_jsonb(enum_value)))
    order by attribute_code) from product_variant_attribute_values where variant_id=_variant),'[]'),
  'providerMappings',coalesce((select jsonb_agg(jsonb_build_object('provider',provider_code,'variant',external_variant_id,
    'configuration',external_configuration) order by id) from provider_product_mappings where product_variant_id=_variant),'[]')
)
$$;
revoke all on function public.fine_art_image_configuration(uuid) from public,anon,authenticated;
grant execute on function public.fine_art_image_configuration(uuid) to service_role;

create function public.fine_art_variant_problems(_variant uuid)
returns text[] language sql stable set search_path=public as $$
select array_remove(array[
  case when a.id is null or a.allows_prints is distinct from true or (a.version_kind='SUCCESSOR' and a.version_published_at is null) then 'artwork' end,
  case when nullif(trim(p.title_es),'') is null or nullif(trim(p.title_en),'') is null
    or nullif(trim(p.description_es),'') is null or nullif(trim(p.description_en),'') is null then 'descriptions' end,
  case when not exists(select 1 from product_variant_attribute_values at where at.variant_id=v.id
    and at.attribute_code='size' and nullif(trim(at.text_value),'') is not null)
    and not exists(select 1 from wall_art_mockups w where w.variant_id=v.id and w.width_mm>0 and w.height_mm>0)
    then 'configuration' end,
  case when v.inventory_policy <> 'made_to_order' or v.fulfillment_type not in ('manual','provider') then 'inventory' end,
  case when coalesce(cardinality(v.allowed_countries),0)=0 then 'destinations' end,
  case when v.replaces_print_id is not null and not exists(select 1 from artwork_prints lp where lp.id=v.replaces_print_id and lp.artwork_id=a.id and lp.edition_type::text='OPEN') then 'legacy_mapping' end,
  case when not exists (select 1 from product_variant_assets g join art_assets m on m.id=g.asset_id
    where g.variant_id=v.id and g.role='gallery' and g.is_primary and g.verified_at is not null and g.configuration_snapshot=fine_art_image_configuration(v.id)
      and m.artwork_id=a.id and m.visibility='public' and m.processing_status='ready'
      and m.asset_type in ('mockup','lifestyle') and nullif(m.public_url,'') is not null) then 'image' end,
  case when not exists(select 1 from product_variant_assets link join art_assets f on f.id=link.asset_id
    where link.variant_id=v.id and link.role='production' and f.artwork_id=a.id and f.visibility='private'
      and f.asset_type='production_derivative' and f.processing_status='ready') then 'production_asset' end,
  case when v.fulfillment_type='provider' and not exists(
    select 1 from provider_product_mappings m join fulfillment_providers s on s.code=m.provider_code and s.enabled
    join product_variant_assets link on link.variant_id=v.id and link.asset_id=m.production_asset_id and link.role='production'
    where m.product_variant_id=v.id and m.enabled and m.validation_status='validated'
      and v.allowed_countries <@ m.allowed_countries) then 'provider_mapping' end,
  case when not exists(
    select 1 from (
      select b.country,b.currency,dense_rank() over(partition by b.country,b.currency order by b.priority desc) as rank
      from price_book_entries e join price_books b on b.id=e.price_book_id
      where e.product_variant_id=v.id and e.amount_minor between 1 and 99999999 and e.status='active' and b.status='active'
        and b.channel='storefront' and b.segment is null and b.country=any(v.allowed_countries) and b.currency in ('MXN','USD')
        and (coalesce(cardinality(destinations.allowed_shipping_countries),0)=0 or b.country=any(destinations.allowed_shipping_countries))
        and exists(select 1 from site_settings s join shipping_policies sp on sp.active
          where s.id=true and b.country=any(s.global_shipping_countries)
          and sp.method<>'QUOTE_REQUIRED' and cardinality(sp.postal_codes)=0
          and (cardinality(sp.countries)=0 or b.country=any(sp.countries))
          and case when cardinality(destinations.shipping_policy_ids)>0 then sp.id=any(destinations.shipping_policy_ids)
            else coalesce(s.default_shipping_policies->'open_print' ? sp.id::text,false) end)
        and now() < coalesce(e.valid_to,'infinity') and now() >= coalesce(e.valid_from,'-infinity')
        and now() < coalesce(b.valid_to,'infinity') and now() >= coalesce(b.valid_from,'-infinity')
    ) ranked where rank=1 group by country,currency having count(*)=1
  ) then 'price' end
],null)
from product_variants v join products p on p.id=v.product_id
left join artwork_products rel on rel.product_id=p.id and rel.is_primary
left join artworks_discoverable a on a.id=rel.artwork_id
left join artworks destinations on destinations.id=a.id
where v.id=_variant
$$;

create function public.public_fine_art_variant_ids(_artworks uuid[] default null,_variants uuid[] default null)
returns table(id uuid) language sql stable set search_path=public as $$
select v.id from product_variants v join products p on p.id=v.product_id
join artwork_products a on a.product_id=p.id and a.is_primary
where p.status='published' and v.status='active'
  and (_artworks is null or a.artwork_id=any(_artworks))
  and (_variants is null or v.id=any(_variants))
  and cardinality(fine_art_variant_problems(v.id))=0
order by v.id
$$;
revoke all on function public.public_fine_art_variant_ids(uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.public_fine_art_variant_ids(uuid[],uuid[]) to service_role;

create function public.transition_fine_art_product(_actor uuid,_product uuid,_action text,_variant uuid default null)
returns void language plpgsql set search_path=public as $$
declare p products; target product_variants; problems text[];
begin
  if _actor is null then raise exception 'actor_required'; end if;
  select * into p from products where id=_product for update;
  if not found or p.legacy_source is not null then raise exception 'publication_transition_invalid'; end if;
  if _action='approve' and p.status='pending_review' then
    update products set status='approved',updated_at=now() where id=_product;
  elsif _action='publish' and p.status in ('approved','unpublished','published') then
    select * into target from product_variants where id=_variant and product_id=p.id for update;
    if not found or target.status='archived' then raise exception 'publication_transition_invalid'; end if;
    problems:=fine_art_variant_problems(target.id);
    if problems is null or cardinality(problems)>0 then raise exception 'publication_ineligible'; end if;
    update product_variants set status='active',updated_at=now() where id=target.id;
    update products set status='published',updated_at=now() where id=_product;
  elsif _action='unpublish' and p.status='published' then
    update product_variants set status='ready',updated_at=now() where product_id=p.id and status='active'
      and (_variant is null or id=_variant);
    if not exists(select 1 from product_variants where product_id=p.id and status='active') then
      update products set status='unpublished',updated_at=now() where id=p.id;
    end if;
  elsif _action='archive' and p.status in ('draft','approved','unpublished') then
    update product_variants set status='archived',updated_at=now() where product_id=p.id;
    update products set status='archived',updated_at=now() where id=p.id;
  elsif _action='revise' and p.status in ('pending_review','approved','unpublished') then
    update products set status='draft',updated_at=now() where id=p.id;
  else raise exception 'publication_transition_invalid';
  end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'fine_art_'||_action,coalesce(_variant,_product));
end $$;

create function public.add_fine_art_commercial_image(_actor uuid,_variant uuid,_url text,_alt_es text,_alt_en text,_source text,_primary boolean)
returns uuid language plpgsql set search_path=public as $$
declare v product_variants; art uuid; asset uuid; config jsonb;
begin
  if _actor is null then raise exception 'actor_required'; end if;
  select * into v from product_variants where id=_variant for update;
  if not found or v.status in ('active','archived') then raise exception 'publication_transition_invalid'; end if;
  select artwork_id into art from artwork_products where product_id=v.product_id and is_primary;
  if art is null then raise exception 'artwork_not_linked'; end if;
  config:=fine_art_image_configuration(v.id);
  insert into art_assets(artwork_id,asset_type,visibility,public_url) values(art,'mockup','public',_url) returning id into asset;
  if _primary then update product_variant_assets set is_primary=false where variant_id=v.id and role='gallery'; end if;
  insert into product_variant_assets(variant_id,asset_id,role,is_primary,source,configuration_snapshot,alt_es,alt_en,verified_at,verified_by)
    values(v.id,asset,'gallery',_primary,_source,config,_alt_es,_alt_en,now(),_actor);
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'verify_commercial_image',v.id);
  return asset;
end $$;

revoke all on function public.fine_art_variant_problems(uuid),public.transition_fine_art_product(uuid,uuid,text,uuid),
  public.add_fine_art_commercial_image(uuid,uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fine_art_variant_problems(uuid),public.transition_fine_art_product(uuid,uuid,text,uuid),
  public.add_fine_art_commercial_image(uuid,uuid,text,text,text,text,boolean) to service_role;

create function public.select_commercial_primary(_actor uuid,_variant uuid,_asset uuid)
returns void language plpgsql set search_path=public as $$
begin
  if _actor is null then raise exception 'actor_required'; end if;
  perform 1 from product_variants where id=_variant and status not in ('active','archived') for update;
  if not found or not exists(select 1 from product_variant_assets where variant_id=_variant and asset_id=_asset
    and role='gallery' and verified_at is not null) then raise exception 'publication_transition_invalid'; end if;
  update product_variant_assets set is_primary=false where variant_id=_variant and role='gallery' and is_primary;
  update product_variant_assets set is_primary=true where variant_id=_variant and asset_id=_asset and role='gallery';
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'select_commercial_primary',_variant);
end $$;
revoke all on function public.select_commercial_primary(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.select_commercial_primary(uuid,uuid,uuid) to service_role;

create function public.remove_commercial_gallery_image(_actor uuid,_variant uuid,_asset uuid)
returns void language plpgsql set search_path=public as $$
begin
  if _actor is null then raise exception 'actor_required'; end if;
  perform 1 from product_variants where id=_variant and status not in ('active','archived') for update;
  if not found then raise exception 'publication_transition_invalid'; end if;
  delete from product_variant_assets where variant_id=_variant and asset_id=_asset and role='gallery';
  if not found then raise exception 'publication_transition_invalid'; end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'remove_commercial_gallery_image',_variant);
end $$;
revoke all on function public.remove_commercial_gallery_image(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_commercial_gallery_image(uuid,uuid,uuid) to service_role;
grant delete on public.product_variant_assets to service_role;

create table public.fine_art_checkouts (
  id uuid primary key default gen_random_uuid(), buyer_id uuid not null,
  country text not null, currency text not null check(currency in ('MXN','USD')),
  lines jsonb not null, stripe_session_id text unique, order_id uuid references public.orders,
  created_at timestamptz not null default now()
);
alter table public.fine_art_checkouts enable row level security;
revoke all on public.fine_art_checkouts from public,anon,authenticated;
grant select,insert,update on public.fine_art_checkouts to service_role;
alter table public.order_items add column catalog_configuration_snapshot jsonb;

create function public.prevent_fine_art_snapshot_changes() returns trigger
language plpgsql set search_path=public as $$
begin
  if tg_table_name='fine_art_checkouts' then
    if row(new.buyer_id,new.country,new.currency,new.lines) is distinct from row(old.buyer_id,old.country,old.currency,old.lines)
      or (old.stripe_session_id is not null and new.stripe_session_id is distinct from old.stripe_session_id)
      or (old.order_id is not null and new.order_id is distinct from old.order_id) then raise exception 'immutable_fine_art_snapshot'; end if;
  elsif new.catalog_configuration_snapshot is distinct from old.catalog_configuration_snapshot or
    (old.catalog_configuration_snapshot is not null and
      row(new.artwork_id,new.title_snapshot,new.sku_snapshot,new.unit_price_mxn,new.quantity)
        is distinct from row(old.artwork_id,old.title_snapshot,old.sku_snapshot,old.unit_price_mxn,old.quantity)) then
    raise exception 'immutable_fine_art_snapshot';
  end if;
  return new;
end $$;
create trigger fine_art_checkout_snapshot before update on public.fine_art_checkouts
for each row execute function public.prevent_fine_art_snapshot_changes();
create trigger fine_art_order_snapshot before update of catalog_configuration_snapshot,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity on public.order_items
for each row execute function public.prevent_fine_art_snapshot_changes();

-- Independent purchases use the normal display type PRINT but have no legacy print ID.
-- Their dedicated trigger predicate never permits an ownership claim or numbered unit.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.block_unimplemented_physical_edition_sales()'::regprocedure);
  if position('if new.artwork_id is null' in definition)=0 then raise exception 'unexpected_order_guard'; end if;
  definition:=replace(definition,'if new.artwork_id is null', $guard$
 if new.catalog_configuration_snapshot is not null then
   if current_setting('jbu.fine_art_fulfillment',true) is distinct from 'authorized'
     or new.product_type_snapshot is distinct from 'PRINT' or new.artwork_id is null
     or new.claim_token_snapshot is not null or new.print_variant_id is not null or new.physical_edition_unit_id is not null
   then raise exception 'invalid_fine_art_order_item'; end if;
   return new;
 end if;
 if new.artwork_id is null$guard$);
  execute definition;
end $$;

create function public.fulfill_fine_art_checkout(_checkout uuid,_session text,_intent text,_email text,_name text,_phone text,
 _shipping jsonb,_total_mxn numeric,_currency text,_amount_minor bigint,_fx numeric,_paid_lines jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare checkout fine_art_checkouts; item jsonb; paid jsonb; new_order uuid; unit_mxn numeric; expected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(_session,0));
  select * into checkout from fine_art_checkouts where id=_checkout for update;
  if not found or checkout.stripe_session_id is distinct from _session or checkout.currency is distinct from _currency
    or checkout.country is distinct from _shipping->>'country' then raise exception 'fine_art_session_mismatch'; end if;
  if checkout.order_id is not null then return jsonb_build_object('orderId',checkout.order_id,'existing',true); end if;
  if nullif(trim(_email),'') is null or _total_mxn<=0 or _amount_minor<=0 or
    (_currency='USD' and coalesce(_fx,0)<=0) or jsonb_typeof(_paid_lines) is distinct from 'object'
    or jsonb_array_length(checkout.lines) not between 1 and 30 then raise exception 'fine_art_invalid_payment'; end if;
  expected:=0;
  for item in select value from jsonb_array_elements(checkout.lines) loop
    paid:=_paid_lines->(item->>'variantId');
    if paid is null or (paid->>'quantity')::integer is distinct from (item->>'quantity')::integer
      or (paid->>'subtotal')::bigint is distinct from (item->>'amountMinor')::bigint*(item->>'quantity')::integer
      or paid->>'currency' is distinct from lower(_currency) then raise exception 'fine_art_amount_mismatch'; end if;
    expected:=expected+1;
  end loop;
  if expected <> (select count(*) from jsonb_object_keys(_paid_lines)) then raise exception 'fine_art_amount_mismatch'; end if;
  insert into orders(stripe_session_id,stripe_payment_intent_id,buyer_email,buyer_name,buyer_phone,shipping_address,total_amount_mxn,
    status,payment_method,payment_status,paid_at,buyer_user_id,charged_currency,charged_amount,fx_usd_per_mxn)
  values(_session,_intent,_email,coalesce(_name,'Cliente Galería'),_phone,_shipping,_total_mxn,
    'PAYMENT_RECEIVED','stripe','PAID',now(),checkout.buyer_id,_currency,_amount_minor/100.0,_fx) returning id into new_order;
  perform set_config('jbu.fine_art_fulfillment','authorized',true);
  for item in select value from jsonb_array_elements(checkout.lines) loop
    unit_mxn:=(item->>'amountMinor')::numeric/100.0/coalesce(_fx,1);
    insert into order_items(order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity,
      product_type_snapshot,print_image_url_snapshot,print_size_snapshot,print_finish_snapshot,catalog_configuration_snapshot)
    values(new_order,(item->>'artworkId')::uuid,item->>'title',item->>'sku',round(unit_mxn,2),(item->>'quantity')::integer,'PRINT',
      item->>'image',
      (select x->>'value' from jsonb_array_elements(coalesce(item->'attributes','[]')) x where x->>'code'='size' limit 1),
      (select x->>'value' from jsonb_array_elements(coalesce(item->'attributes','[]')) x where x->>'code'='finish' limit 1),item);
  end loop;
  update fine_art_checkouts set order_id=new_order where id=_checkout;
  return jsonb_build_object('orderId',new_order,'existing',false);
end $$;
revoke all on function public.fulfill_fine_art_checkout(uuid,text,text,text,text,text,jsonb,numeric,text,bigint,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.fulfill_fine_art_checkout(uuid,text,text,text,text,text,jsonb,numeric,text,bigint,numeric,jsonb) to service_role;
commit;
