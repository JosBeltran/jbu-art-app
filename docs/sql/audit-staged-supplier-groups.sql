-- READ ONLY. Audit the same in-progress run; do not query supplier_catalog_groups,
-- which is populated only on final activation. Export the resulting 801 (or current) rows.
with groups as (
  select e.group_key,
    min(e.family) as family,
    count(*) as indexed_variants,
    count(distinct e.family) as family_values,
    count(distinct coalesce(e.metadata->'construction','{}')) as construction_values,
    (jsonb_agg(e.metadata order by e.external_id,e.external_variant_id)->0) as metadata,
    (array_agg(distinct e.external_id order by e.external_id))[1:3] as sample_source_product_ids,
    array_agg(distinct e.product->>'category') as source_catalogs,
    count(distinct e.variant->'attributes'->>'size') as size_options,
    count(distinct e.variant->'attributes'->>'frame_color') as frame_color_options,
    count(*) filter(where e.variant->>'widthMm' is null or e.variant->>'heightMm' is null) as variants_without_physical_dimensions
  from public.supplier_catalog_entries e
  where e.revision='44ab91a4-9973-4b5f-9ad6-9e604b42d33a'::uuid
  group by e.group_key
), audit as (
  select group_key,family,metadata->'titles' as titles,metadata->'construction' as construction,
    metadata->>'identitySource' as identity_source,source_catalogs,sample_source_product_ids,
    indexed_variants,size_options,frame_color_options,variants_without_physical_dimensions,
    family_values,construction_values,
    count(*) over(partition by family,metadata->'titles',metadata->'construction') as group_keys_same_title_construction
  from groups
)
select * from audit
order by group_keys_same_title_construction desc,family,titles::text,group_key;
-- family_values/construction_values > 1 flag inconsistent groups.
-- group_keys_same_title_construction > 1 flags possible over-segmentation, NOT a licence to merge:
-- unknown UID tokens may encode legitimate frame profiles, substrates or other constructions.
-- Missing physical dimensions are a metadata review flag, not grounds to invent measurements.
