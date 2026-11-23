begin;

create or replace function public.claim_catalog_fulfillment(_actor uuid,_job uuid)
returns jsonb language plpgsql set search_path=public as $$
declare job catalog_fulfillment_jobs; paid orders; master art_assets; quote_currency text;
begin
  if _actor is null then raise exception 'actor_required'; end if;
  select * into job from catalog_fulfillment_jobs where id=_job for update;
  if not found or job.state<>'approved' then raise exception 'fulfillment_already_claimed'; end if;
  select * into paid from orders where id=job.order_id and payment_status::text='PAID' and payment_method::text='stripe'
    and stripe_session_id is not null and status::text not in ('CANCELLED','SHIPPED','DELIVERED') for share;
  if not found or paid.shipping_address->>'country' is distinct from job.country then raise exception 'fulfillment_not_eligible'; end if;
  select q.currency into quote_currency
  from provider_quotes q join product_discovery_candidates c on c.id=q.candidate_id
  where q.id=job.approved_quote_id and q.quoted_at<=now() and q.expires_at>now()
    and q.country=job.country and c.provider_code=job.provider_code
    and c.external_variant_id=job.snapshot->>'externalVariantId'
    and q.options->'quantity'=job.snapshot->'quantity'
    and coalesce(q.options->'attributes','{}')=job.snapshot->'configuration'
    and q.options->>'fulfillmentJobId'=job.id::text
    and q.options->>'destinationVersion'=md5(paid.shipping_address::text)
    and exists (select 1 from jsonb_array_elements(q.options->'methods') method
      where method->>'method'=job.shipping_method
        and case when jsonb_typeof(method->'shippingMinor')='number'
          then (method->>'shippingMinor')::numeric>=0 else false end)
  for share of q,c;
  if not found then
    raise exception 'quote_expired_or_mismatched'; end if;
  if not exists(select 1 from provider_product_mappings m join fulfillment_providers fp on fp.code=m.provider_code and fp.enabled
      where m.id=job.mapping_id and m.provider_code=job.provider_code
      and m.external_variant_id=job.snapshot->>'externalVariantId' and m.enabled and m.validation_status='validated'
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

commit;
