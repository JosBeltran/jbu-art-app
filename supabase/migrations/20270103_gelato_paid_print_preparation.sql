begin;

alter table public.catalog_fulfillment_jobs
  alter column production_asset_id drop not null,
  alter column mapping_id drop not null,
  alter column created_by drop not null,
  add column order_master_path text,
  add column shipments jsonb not null default '[]'::jsonb;

-- Capture only an unambiguous Studio handoff. The service role calls this while
-- creating the Stripe checkout, before the customer can pay.
create function public.gelato_checkout_requirements(_variant uuid, _artwork uuid, _country text)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object(
    'mappingId',m.id,'candidateId',c.id,'externalVariantId',m.external_variant_id,
    'configuration',m.external_configuration,'artworkPrintId',p.id,
    'widthMm',w.width_mm,'heightMm',w.height_mm,'fit',w.fit,
    'orientation',coalesce(p.orientation,case when w.width_mm>w.height_mm then 'landscape'
      when w.width_mm<w.height_mm then 'portrait' else 'square' end),
    'border',case when p.id is not null then jsonb_build_object('unit',p.border_unit,'value',p.border_value)
      else jsonb_build_object('unit','mm','value',coalesce(w.border_mm,0)) end,
    'revisionId',g.revision_id,'sourceRevision',g.source_image_ref->>'sha256','layout',g.layout,
    'preview',g.preview_image_url,
    'technical',coalesce(c.catalog_snapshot->'variant',external.specification))
  from product_variants v
  join product_discovery_selections sel on sel.product_variant_id=v.id
  join product_discovery_candidates c on c.id=sel.candidate_id and c.provider_code='gelato'
  join product_discovery_sessions s on s.id=c.session_id and s.artwork_id=_artwork
  join provider_product_mappings m on m.product_variant_id=v.id and m.provider_code=c.provider_code
    and m.external_variant_id=c.external_variant_id
  join wall_art_mockups w on w.variant_id=v.id
  left join artwork_prints p on p.id=v.artwork_print_id and p.artwork_id=_artwork
  left join print_asset_generations g on g.print_id=p.id and g.artwork_id=_artwork and g.is_current
    and g.layout->'paperWidthMm'=to_jsonb(w.width_mm)
    and g.layout->'paperHeightMm'=to_jsonb(w.height_mm)
    and g.layout->'borderSpec'=jsonb_build_object('unit',p.border_unit,'value',p.border_value)
    and p.orientation=case when w.width_mm>w.height_mm then 'landscape'
      when w.width_mm<w.height_mm then 'portrait' else 'square' end
    and g.layout->>'fitStrategy'=w.fit
  left join provider_catalog_variants external on external.provider_code=c.provider_code
    and external.external_id=c.external_id and external.external_variant_id=c.external_variant_id
  where v.id=_variant and (coalesce(cardinality(m.allowed_countries),0)=0 or _country=any(m.allowed_countries))
    and (select count(*) from provider_product_mappings where product_variant_id=v.id and provider_code='gelato')=1;
$$;

create function public.capture_paid_gelato_preparation() returns trigger
language plpgsql security definer set search_path=public as $$
declare config jsonb:=new.catalog_configuration_snapshot; requirements jsonb:=config->'production';
  generation print_asset_generations; preparation_state text;
begin
  if requirements->>'externalVariantId' is null or not exists (
    select 1 from orders o where o.id=new.order_id and o.payment_status::text='PAID'
    and o.payment_method::text='stripe' and o.stripe_session_id is not null
  ) then return new; end if;
  select * into generation from print_asset_generations where revision_id::text=requirements->>'revisionId'
    and artwork_id=new.artwork_id and print_id::text=requirements->>'artworkPrintId'
    and source_image_ref->>'sha256'=requirements->>'sourceRevision' for update;
  preparation_state:=case
    when generation.revision_id is null then 'MANUAL_REVIEW'
    when generation.production_status='MASTER_READY' and generation.master_approved_at is not null then 'READY'
    when generation.production_status='MASTER_READY' then 'AWAITING_APPROVAL'
    else 'AWAITING_PREPARATION' end;
  insert into print_order_preparations(item_id,order_id,revision_id,snapshot,state,approved_at)
  values(new.id,new.order_id,generation.revision_id,
    requirements||jsonb_build_object('title',new.title_snapshot,'quantity',new.quantity,'sku',new.sku_snapshot,
      'size',new.print_size_snapshot,'finish',new.print_finish_snapshot,'variantId',config->>'variantId',
      'artworkId',new.artwork_id,'preview',coalesce(requirements->>'preview',config->>'image'),
      'attributes',config->'attributes'),preparation_state,case when preparation_state='READY' then now() end)
  on conflict(item_id) do nothing;
  insert into catalog_fulfillment_jobs(order_item_id,order_id,mapping_id,provider_code,country,snapshot)
  values(new.id,new.order_id,null,'gelato',config->>'country',
    requirements||jsonb_build_object('catalog',true,'quantity',new.quantity,'title',new.title_snapshot,
      'customerPaymentMinor',(config->>'amountMinor')::bigint*new.quantity,'chargedCurrency',config->>'currency'))
  on conflict(order_item_id) do nothing;
  return new;
end $$;

create trigger capture_paid_gelato_preparation after insert on public.order_items
for each row when(new.catalog_configuration_snapshot is not null)
execute function public.capture_paid_gelato_preparation();

revoke all on function public.gelato_checkout_requirements(uuid,uuid,text),public.capture_paid_gelato_preparation()
  from public,anon,authenticated;
grant execute on function public.gelato_checkout_requirements(uuid,uuid,text) to service_role;

-- Catalog preparations sharing a frozen revision also share its approval.
create function public.refresh_catalog_print_preparations() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update print_order_preparations p set state='READY',approved_at=new.master_approved_at
  where p.revision_id=new.revision_id and p.state in ('AWAITING_APPROVAL','AWAITING_PREPARATION')
    and exists(select 1 from catalog_fulfillment_jobs j where j.order_item_id=p.item_id
      and j.snapshot->'catalog'='true'::jsonb and j.snapshot->'layout'=new.layout)
    and exists(select 1 from orders o where o.id=p.order_id and o.payment_status::text='PAID'
      and o.status::text<>'CANCELLED');
  return new;
end $$;
create trigger refresh_catalog_print_preparations after update of master_approved_at on public.print_asset_generations
for each row when (new.master_approved_at is not null and new.master_approved_at is distinct from old.master_approved_at)
execute function public.refresh_catalog_print_preparations();
revoke all on function public.refresh_catalog_print_preparations() from public,anon,authenticated;

-- Prepared-preview revisions are eligible for attaching a validated final file.
-- The render path itself still requires algorithmVersion 1.
create or replace function public.claim_print_master(_revision uuid, _lease uuid) returns boolean
language sql security definer set search_path=public as $$
  with claimed as (
    update print_asset_generations set production_status='MASTER_GENERATING', master_error=null,
      master_lease=_lease,master_lease_until=now()+interval '5 minutes'
    where revision_id=_revision and production_file_path is null
      and (production_status<>'MASTER_GENERATING' or master_lease_until<now())
      and (is_current or exists (select 1 from print_order_preparations where revision_id=_revision))
      and (layout->>'algorithmVersion'='1' or
        (layout->>'algorithmVersion'='3' and exists (
          select 1 from print_order_preparations p join catalog_fulfillment_jobs j on j.order_item_id=p.item_id
          where p.revision_id=_revision and j.snapshot->'catalog'='true'::jsonb)))
    returning 1
  ) select exists(select 1 from claimed);
$$;

alter function public.claim_catalog_fulfillment(uuid,uuid) rename to claim_legacy_catalog_fulfillment;
revoke execute on function public.claim_legacy_catalog_fulfillment(uuid,uuid) from service_role;

create function public.claim_catalog_fulfillment(_actor uuid,_job uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare job catalog_fulfillment_jobs; paid orders; master_path text; quote_currency text;
begin
  if _actor is null then raise exception 'actor_required'; end if;
  select * into job from catalog_fulfillment_jobs where id=_job for update;
  if not found or job.state<>'approved' then raise exception 'fulfillment_already_claimed'; end if;
  select * into paid from orders where id=job.order_id and payment_status::text='PAID' and payment_method::text='stripe'
    and stripe_session_id ~ '^cs_live_[A-Za-z0-9]+$'
    and status::text not in ('CANCELLED','SHIPPED','DELIVERED') for share;
  if not found or paid.shipping_address->>'country' is distinct from job.country
    then raise exception 'fulfillment_not_eligible'; end if;
  if job.snapshot->'catalog' is distinct from 'true'::jsonb then
    return public.claim_legacy_catalog_fulfillment(_actor,_job);
  end if;
  if not exists(select 1 from fulfillment_providers where code=job.provider_code and enabled)
    then raise exception 'fulfillment_not_eligible'; end if;
  select currency into quote_currency from provider_quotes where id=job.approved_quote_id and expires_at>now()
    and options->>'fulfillmentJobId'=job.id::text
    and options->>'destinationVersion'=md5(paid.shipping_address::text) for share;
  if not found then raise exception 'quote_expired_or_mismatched'; end if;
  select g.production_file_path into master_path from print_order_preparations p join print_asset_generations g on g.revision_id=p.revision_id
    where p.item_id=job.order_item_id and p.state='READY' and g.master_approved_at is not null
    and g.production_status='MASTER_READY' and nullif(g.production_file_path,'') is not null
    and g.revision_id::text=job.snapshot->>'revisionId'
    and g.source_image_ref->>'sha256'=job.snapshot->>'sourceRevision'
    and g.layout=job.snapshot->'layout'
    and coalesce(g.master_source_ref->>'format',g.layout->>'fileFormat','jpeg') in ('jpeg','png')
    and (select count(*) from jsonb_array_elements(case when jsonb_typeof(job.snapshot#>'{technical,printAreas}')='array'
      then job.snapshot#>'{technical,printAreas}' else '[]'::jsonb end) area
      where area->'required'='true'::jsonb)<=1
    and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(job.snapshot#>'{technical,printAreas}')='array'
      then job.snapshot#>'{technical,printAreas}' else '[]'::jsonb end) area
      where area->'required'='true'::jsonb and (
        coalesce(nullif(area->>'name',''),'default')<>'default' or
        abs((area->>'widthMm')::numeric-(job.snapshot->>'widthMm')::numeric)>1 or
        abs((area->>'heightMm')::numeric-(job.snapshot->>'heightMm')::numeric)>1 or
        coalesce((g.master_source_ref->>'effectiveDpi')::numeric,g.effective_dpi,0)<(area->>'recommendedDpi')::numeric
      ))
    for share of g,p;
  if master_path is null and job.order_master_path is not null and exists(
    select 1 from print_order_preparations p where p.item_id=job.order_item_id and p.state='READY' and p.revision_id is null
  ) then master_path:=job.order_master_path; end if;
  if master_path is null then raise exception 'fulfillment_not_eligible'; end if;
  update catalog_fulfillment_jobs set state='submitting',claimed_at=now() where id=_job;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'claim_fulfillment',_job);
  return jsonb_build_object('provider',job.provider_code,'snapshot',job.snapshot,'shippingMethod',job.shipping_method,
    'quoteCurrency',quote_currency,'address',paid.shipping_address,'name',coalesce(nullif(paid.shipping_address->>'recipient_name',''),paid.buyer_name),'email',paid.buyer_email,
    'phone',paid.buyer_phone,'storagePath',master_path);
end $$;
revoke all on function public.claim_catalog_fulfillment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_catalog_fulfillment(uuid,uuid) to service_role;

create or replace function public.catalog_fulfillment_quote_context(_job uuid)
returns jsonb language sql stable set search_path=public as $$
  select jsonb_build_object('provider',j.provider_code,'snapshot',j.snapshot,'country',j.country,
    'address',o.shipping_address,'destinationVersion',md5(o.shipping_address::text),
    'name',coalesce(nullif(o.shipping_address->>'recipient_name',''),o.buyer_name),'email',o.buyer_email,'phone',o.buyer_phone)
  from catalog_fulfillment_jobs j join orders o on o.id=j.order_id
  where j.id=_job and j.state in ('pending_review','approved') and o.stripe_session_id is not null
    and o.payment_method::text='stripe' and o.payment_status::text='PAID'
    and o.status::text not in ('CANCELLED','SHIPPED','DELIVERED')
    and o.shipping_address->>'country'=j.country
    and (j.snapshot->'catalog' is distinct from 'true'::jsonb or exists (
      select 1 from print_order_preparations p where p.item_id=j.order_item_id and p.state='READY'
    ));
$$;

alter table public.print_order_preparations drop constraint print_order_preparations_check1;
alter table public.print_order_preparations add constraint print_preparation_revision_required
  check (state='MANUAL_REVIEW' or revision_id is not null or
    (state='READY' and snapshot->>'externalVariantId' is not null));

create function public.approve_gelato_order_master(_item uuid, _actor uuid, _path text)
returns boolean language plpgsql security definer set search_path=public as $$
declare job catalog_fulfillment_jobs;
begin
  select j.* into job from catalog_fulfillment_jobs j join orders o on o.id=j.order_id
    where j.order_item_id=_item and j.provider_code='gelato' and j.state='pending_review'
      and o.payment_status::text='PAID' and o.status::text not in ('CANCELLED','SHIPPED','DELIVERED')
      for update of j for share of o;
  if not found or _actor is null or job.order_master_path is not null or
    _path !~ ('^orders/'||job.id::text||'/[a-f0-9-]{36}/master[.](jpg|png)$') then return false; end if;
  update print_order_preparations set state='READY',approved_by=_actor,approved_at=now()
    where item_id=_item and state='MANUAL_REVIEW' and revision_id is null;
  if not found then return false; end if;
  update catalog_fulfillment_jobs set order_master_path=_path where id=job.id;
  return true;
end $$;
revoke all on function public.approve_gelato_order_master(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.approve_gelato_order_master(uuid,uuid,text) to service_role;

commit;
