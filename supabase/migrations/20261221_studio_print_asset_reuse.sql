begin;

create function public.studio_print_master_resolution(_variant uuid)
returns table(status text, revision_id uuid, effective_dpi numeric) language sql stable set search_path=public as $$
  with configuration as (
    select session.artwork_id, w.*, upper(trim(a.text_value)) target_size,
      coalesce(c.catalog_snapshot->'variant', supplier.specification) spec
    from product_variants v
    join wall_art_mockups w on w.variant_id=v.id
    join product_discovery_selections chosen on chosen.product_variant_id=v.id
    join product_discovery_candidates c on c.id=chosen.candidate_id
    join product_discovery_sessions session on session.id=c.session_id
    join artwork_products rel on rel.product_id=v.product_id and rel.artwork_id=session.artwork_id and rel.is_primary
    left join provider_catalog_variants supplier on supplier.provider_code=c.provider_code
      and supplier.external_id=c.external_id and supplier.external_variant_id=c.external_variant_id
    left join product_variant_attribute_values a on a.variant_id=v.id and a.attribute_code='size'
    where v.id=_variant
  ), revisions as (
    select g.*, config.width_mm, config.height_mm, config.border_mm, config.fit, config.spec,
      coalesce(assessment.dpi,g.effective_dpi) as assessed_dpi,
      g.production_status='MASTER_READY' and nullif(btrim(g.production_file_path),'') is not null and
      (g.master_approved_at is not null or assessment.dpi>0 or validated.reused) as validated
    from configuration config
    join artwork_prints p on p.artwork_id=config.artwork_id
    left join print_asset_generations g on g.print_id=p.id and g.artwork_id=p.artwork_id
      and (upper(btrim(p.size))=upper(btrim(g.size)) or
        substring(upper(btrim(p.size)) from '^(A[0-9]+)(?:[^A-Z0-9]|$)')=upper(btrim(g.size)))
    -- Deferred masters store the checked replacement-source DPI on completion.
    cross join lateral (select case
      when jsonb_typeof(g.master_source_ref->'effectiveDpi')='number'
      then (g.master_source_ref->>'effectiveDpi')::numeric end dpi) assessment
    cross join lateral (select exists (
      select 1 from art_assets asset join provider_product_mappings m on m.production_asset_id=asset.id
      where asset.artwork_id=config.artwork_id and asset.storage_bucket='print-masters'
        and asset.storage_path=g.production_file_path and asset.asset_type='production_derivative'
        and asset.visibility='private' and asset.processing_status='ready'
        and m.validation_status='validated' and m.enabled
    ) reused) validated
    where (g.is_current or validated.reused or g.revision_id is null)
      and (config.target_size is null or config.target_size !~ '^A[0-9]+$'
        or substring(upper(btrim(p.size)) from '^(A[0-9]+)(?:[^A-Z0-9]|$)')=config.target_size)
  ), compatible as (
    select r.revision_id, r.assessed_dpi
    from revisions r
    where r.validated and r.assessed_dpi>0
      and case when jsonb_typeof(r.layout->'paperWidthMm')='number'
          and jsonb_typeof(r.layout->'paperHeightMm')='number'
        then abs((r.layout->>'paperWidthMm')::numeric-r.width_mm)<=1
          and abs((r.layout->>'paperHeightMm')::numeric-r.height_mm)<=1 else false end
      and case when (r.layout->>'width') ~ '^[1-9][0-9]{0,8}$'
            and (r.layout->>'height') ~ '^[1-9][0-9]{0,8}$'
        then abs((r.layout->>'width')::numeric/(r.layout->>'height')::numeric
          / (r.width_mm/nullif(r.height_mm,0))-1)<=0.01 else false end
      and (r.border_mm=0 or (r.fit='contain' and
        (select min((r.layout->'marginsMm'->>edge)::numeric)
          from unnest(array['top','right','bottom','left']) edge
          where jsonb_typeof(r.layout->'marginsMm'->edge)='number'
          having count(*)=4) between r.border_mm-0.15 and r.border_mm+0.15))
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(r.spec->'printAreas')='array'
          then r.spec->'printAreas' else '[]'::jsonb end) area
        where area->'required'='true'::jsonb
          and case when jsonb_typeof(area->'recommendedDpi')='number'
            then r.assessed_dpi<(area->>'recommendedDpi')::numeric else false end
      )
      and (select count(*) from jsonb_array_elements(case when jsonb_typeof(r.spec->'printAreas')='array'
        then r.spec->'printAreas' else '[]'::jsonb end) area where area->'required'='true'::jsonb)<=1
    order by r.is_current desc,r.assessed_dpi desc,r.generated_at desc,r.revision_id limit 1
  )
  select case when exists(select 1 from compatible) then 'available'
    when exists(select 1 from revisions where validated) then 'incompatible'
    when exists(select 1 from revisions) then 'needs_validation'
    else 'missing' end, (select c.revision_id from compatible c), (select c.assessed_dpi from compatible c);
$$;

revoke all on function public.studio_print_master_resolution(uuid) from public,anon,authenticated;
grant execute on function public.studio_print_master_resolution(uuid) to service_role;

create or replace function public.link_studio_print_master(_variant uuid)
returns void language plpgsql set search_path=public as $$
declare master print_asset_generations; asset uuid; artwork uuid; resolution record; target product_variants;
begin
  select * into target from product_variants where id=_variant for update;
  if not found or target.status in ('active','archived') then return; end if;
  if exists (select 1 from provider_product_mappings m
    where m.product_variant_id=_variant and (m.enabled or m.production_asset_id is not null)) then return; end if;
  select * into resolution from studio_print_master_resolution(_variant);
  if resolution.status <> 'available' then return; end if;
  select * into master from print_asset_generations where revision_id=resolution.revision_id;
  if not found then return; end if;
  artwork:=master.artwork_id;

  insert into art_assets(artwork_id,storage_bucket,storage_path,asset_type,visibility,width_px,height_px,dpi)
  values(artwork,'print-masters',master.production_file_path,'production_derivative','private',
    (master.layout->>'width')::int,(master.layout->>'height')::int,floor(resolution.effective_dpi))
  on conflict (storage_bucket,storage_path,version) do nothing;
  select id into asset from art_assets where artwork_id=artwork and storage_bucket='print-masters'
    and storage_path=master.production_file_path and asset_type='production_derivative'
    and visibility='private' and processing_status='ready' order by version desc limit 1;
  if asset is null then return; end if;

  insert into product_variant_assets(variant_id,asset_id,role) values(_variant,asset,'production') on conflict do nothing;
  update provider_product_mappings set production_asset_id=asset
  where product_variant_id=_variant and not enabled and production_asset_id is null;
end $$;

commit;
