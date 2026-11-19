begin;

create function public.review_catalog_product(_actor uuid,_product uuid)
returns void language plpgsql set search_path=public as $$
begin
  if _actor is null then raise exception 'actor_required'; end if;
  update products p set status='pending_review',updated_at=now()
    where p.id=_product and p.status='draft' and p.legacy_source is null
      and exists(select 1 from product_variants v where v.product_id=p.id);
  if not found then raise exception 'invalid_review_transition'; end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'submit_product_for_review',_product);
end $$;

-- A separate immutable snapshot stores commercial terms for a provider handoff.
-- Customer shipping/contact data remains on the existing private order.
create table public.catalog_fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items,
  order_id uuid not null references public.orders,
  mapping_id uuid not null references public.provider_product_mappings,
  provider_code text not null references public.fulfillment_providers,
  production_asset_id uuid not null references public.art_assets,
  country text not null check(public.valid_shipping_countries(array[country])),
  snapshot jsonb not null,
  state text not null default 'pending_review' check(state in ('pending_review','approved','submitting','submitted','reconciliation_required')),
  created_by uuid not null, created_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz, claimed_at timestamptz,
  provider_order_id text, provider_status text, shipping_method text,
  approved_quote_id uuid references public.provider_quotes,
  unique(provider_code,provider_order_id)
);
alter table public.catalog_fulfillment_jobs enable row level security;
revoke all on public.catalog_fulfillment_jobs from public,anon,authenticated;
grant select,update on public.catalog_fulfillment_jobs to service_role;

create function public.enable_catalog_provider_mapping(_actor uuid,_mapping uuid,_asset uuid,_countries text[])
returns void language plpgsql set search_path=public as $$
begin
  if _actor is null then raise exception 'actor_required'; end if;
  update provider_product_mappings m set production_asset_id=_asset,allowed_countries=_countries,validation_status='validated',enabled=true
    where m.id=_mapping and exists (
      select 1 from art_assets a join product_variants v on v.id=m.product_variant_id
      join artwork_products ap on ap.product_id=v.product_id and ap.artwork_id=a.artwork_id
      where a.id=_asset and a.visibility='private' and a.asset_type='production_derivative' and a.processing_status='ready'
    );
  if not found then raise exception 'fulfillment_not_eligible'; end if;
  insert into product_variant_assets(variant_id,asset_id,role)
    select product_variant_id,_asset,'production' from provider_product_mappings where id=_mapping on conflict do nothing;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'enable_provider_mapping',_mapping);
end $$;

create function public.prepare_catalog_fulfillment(_actor uuid,_item uuid,_mapping uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare job uuid; existing_mapping uuid;
begin
  if _actor is null then raise exception 'actor_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_item::text,0));
  select id,mapping_id into job,existing_mapping from catalog_fulfillment_jobs where order_item_id=_item;
  if found then
    if existing_mapping is distinct from _mapping then raise exception 'fulfillment_already_claimed'; end if;
    return job;
  end if;

  insert into catalog_fulfillment_jobs(order_item_id,order_id,mapping_id,provider_code,production_asset_id,country,snapshot,created_by)
  select i.id,o.id,m.id,m.provider_code,a.id,o.shipping_address->>'country',
    jsonb_build_object('productId',p.id,'productSku',p.sku,'variantId',v.id,'variantSku',v.sku,'configuration',m.external_configuration,
      'externalVariantId',m.external_variant_id,'quantity',i.quantity,'unitMxn',i.unit_price_mxn,
      'title',i.title_snapshot,'revisionId',prepared.revision_id,'chargedCurrency',o.charged_currency),_actor
  from order_items i
  join orders o on o.id=i.order_id
  join product_variants v on v.legacy_print_id=i.print_variant_id
  join products p on p.id=v.product_id
  join provider_product_mappings m on m.product_variant_id=v.id
  join product_variant_assets pv on pv.variant_id=v.id and pv.asset_id=m.production_asset_id and pv.role='production'
  join art_assets a on a.id=pv.asset_id
  join print_order_preparations prepared on prepared.item_id=i.id and prepared.state='READY'
  join print_asset_generations g on g.revision_id=prepared.revision_id and g.production_file_path=a.storage_path
  join fulfillment_providers fp on fp.code=m.provider_code and fp.enabled
  where i.id=_item and m.id=_mapping and m.enabled and m.validation_status='validated'
    and o.stripe_session_id is not null and o.payment_method::text='stripe' and o.payment_status::text='PAID'
    and o.status::text not in ('CANCELLED','SHIPPED','DELIVERED')
    and a.storage_bucket='print-masters' and a.visibility='private' and a.asset_type='production_derivative'
    and a.processing_status='ready'
    and nullif(o.shipping_address->>'country','') is not null
    and (coalesce(cardinality(m.allowed_countries),0)=0 or o.shipping_address->>'country'=any(m.allowed_countries))
  returning id into job;
  if not found then raise exception 'fulfillment_not_eligible'; end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'prepare_fulfillment',job);
  return job;
end $$;

create function public.catalog_fulfillment_quote_context(_job uuid)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object('provider',j.provider_code,'snapshot',j.snapshot,'country',j.country,
    'address',o.shipping_address,'destinationVersion',md5(o.shipping_address::text))
  from catalog_fulfillment_jobs j join orders o on o.id=j.order_id
  where j.id=_job and j.state in ('pending_review','approved') and o.stripe_session_id is not null
    and o.payment_method::text='stripe' and o.payment_status::text='PAID'
    and o.status::text not in ('CANCELLED','SHIPPED','DELIVERED')
    and o.shipping_address->>'country'=j.country;
$$;

create function public.approve_catalog_fulfillment(_actor uuid,_job uuid,_quote uuid,_method text)
returns void language plpgsql set search_path=public as $$
begin
  if _actor is null then raise exception 'actor_required'; end if;
  update catalog_fulfillment_jobs j set state='approved',approved_by=_actor,approved_at=now(),shipping_method=_method,approved_quote_id=_quote
    where j.id=_job and j.state in ('pending_review','approved') and exists(
      select 1 from provider_quotes q join product_discovery_candidates c on c.id=q.candidate_id
      where q.id=_quote and q.country=j.country and q.expires_at>now() and c.provider_code=j.provider_code
        and c.external_variant_id=j.snapshot->>'externalVariantId' and q.options->'quantity'=j.snapshot->'quantity'
        and q.options->>'fulfillmentJobId'=j.id::text
        and q.options->>'destinationVersion'=public.catalog_fulfillment_quote_context(j.id)->>'destinationVersion'
        and coalesce(q.options->'attributes','{}')=j.snapshot->'configuration'
        and exists(select 1 from jsonb_array_elements(q.options->'methods') o where o->>'method'=_method
          and jsonb_typeof(o->'shippingMinor')='number')
    );
  if not found then raise exception 'fulfillment_not_eligible'; end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'approve_fulfillment',_job);
end $$;

create function public.claim_catalog_fulfillment(_actor uuid,_job uuid)
returns jsonb language plpgsql set search_path=public as $$
declare job catalog_fulfillment_jobs; paid orders; master art_assets; quote_currency text;
begin
  if _actor is null then raise exception 'actor_required'; end if;
  select * into job from catalog_fulfillment_jobs where id=_job for update;
  if not found or job.state<>'approved' then raise exception 'fulfillment_already_claimed'; end if;
  select * into paid from orders where id=job.order_id and payment_status::text='PAID' and payment_method::text='stripe'
    and stripe_session_id is not null and status::text not in ('CANCELLED','SHIPPED','DELIVERED') for share;
  if not found or paid.shipping_address->>'country' is distinct from job.country then raise exception 'fulfillment_not_eligible'; end if;
  select currency into quote_currency from provider_quotes where id=job.approved_quote_id and expires_at>now()
    and options->>'fulfillmentJobId'=job.id::text
    and options->>'destinationVersion'=md5(paid.shipping_address::text) for share;
  if not found then
    raise exception 'quote_expired_or_mismatched'; end if;
  if not exists(select 1 from provider_product_mappings m join fulfillment_providers fp on fp.code=m.provider_code and fp.enabled
      where m.id=job.mapping_id and m.enabled and m.validation_status='validated'
      and job.country=any(m.allowed_countries) and m.production_asset_id=job.production_asset_id
      and m.external_configuration=job.snapshot->'configuration' for share of m,fp) then
    raise exception 'fulfillment_not_eligible'; end if;
  select * into master from art_assets where id=job.production_asset_id and visibility='private'
    and storage_bucket='print-masters' and processing_status='ready' for share;
  if not found or not exists(select 1 from print_order_preparations prepared
    join print_asset_generations g on g.revision_id=prepared.revision_id and g.production_file_path=master.storage_path
    where prepared.item_id=job.order_item_id and prepared.state='READY'
      and prepared.revision_id::text=job.snapshot->>'revisionId') then raise exception 'fulfillment_not_eligible'; end if;
  update catalog_fulfillment_jobs set state='submitting',claimed_at=now() where id=_job;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'claim_fulfillment',_job);
  return jsonb_build_object('provider',job.provider_code,'snapshot',job.snapshot,'shippingMethod',job.shipping_method,'quoteCurrency',quote_currency,'address',paid.shipping_address,
    'name',paid.buyer_name,'email',paid.buyer_email,'phone',paid.buyer_phone,'storagePath',master.storage_path);
end $$;

revoke all on function public.catalog_fulfillment_quote_context(uuid), public.review_catalog_product(uuid,uuid), public.enable_catalog_provider_mapping(uuid,uuid,uuid,text[]),
  public.prepare_catalog_fulfillment(uuid,uuid,uuid),public.approve_catalog_fulfillment(uuid,uuid,uuid,text),public.claim_catalog_fulfillment(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.catalog_fulfillment_quote_context(uuid), public.review_catalog_product(uuid,uuid), public.enable_catalog_provider_mapping(uuid,uuid,uuid,text[]),
  public.prepare_catalog_fulfillment(uuid,uuid,uuid),public.approve_catalog_fulfillment(uuid,uuid,uuid,text),public.claim_catalog_fulfillment(uuid,uuid)
  to service_role;
commit;
