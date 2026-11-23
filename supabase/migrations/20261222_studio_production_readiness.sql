begin;

create or replace function public.studio_print_master_resolution(_variant uuid)
returns table(status text, revision_id uuid, effective_dpi numeric) language sql stable set search_path=public as $$
  with configuration as (
    select session.artwork_id, w.*, upper(trim(a.text_value)) target_size, orientation.enum_value target_orientation,
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
    left join product_variant_attribute_values orientation on orientation.variant_id=v.id and orientation.attribute_code='orientation'
    where v.id=_variant
  ), revisions as (
    select g.*, config.width_mm, config.height_mm, config.border_mm, config.fit, config.spec, config.target_orientation,
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
  ), geometry as (
    select r.*, (select min((r.layout->'marginsMm'->>edge)::numeric)
      from unnest(array['top','right','bottom','left']) edge
      where jsonb_typeof(r.layout->'marginsMm'->edge)='number'
      having count(*)=4) embedded_border_mm,
      case when jsonb_typeof(r.layout->'paperWidthMm')='number'
        then (r.layout->>'paperWidthMm')::numeric end paper_width,
      case when jsonb_typeof(r.layout->'paperHeightMm')='number'
        then (r.layout->>'paperHeightMm')::numeric end paper_height,
      requirements.*
    from revisions r
    cross join lateral (
      select count(*) required_areas,
        max(case when jsonb_typeof(area->'recommendedDpi')='number' then (area->>'recommendedDpi')::numeric end) required_dpi,
        bool_or(case when jsonb_typeof(area->'widthMm')='number' and jsonb_typeof(area->'heightMm')='number'
          then abs((area->>'widthMm')::numeric-r.width_mm)>1 or abs((area->>'heightMm')::numeric-r.height_mm)>1
          else false end) has_different_area
      from jsonb_array_elements(case when jsonb_typeof(r.spec->'printAreas')='array'
        then r.spec->'printAreas' else '[]'::jsonb end) area where area->'required'='true'::jsonb
    ) requirements where r.validated
  ), evaluated as (
    select g.*, case
      when width_mm is null or height_mm is null or paper_width is null or paper_height is null then 'dimensions'
      when (target_orientation='portrait' and width_mm>=height_mm) or
           (target_orientation='landscape' and width_mm<=height_mm) or
           (abs(paper_width-width_mm)>1 and abs(paper_height-height_mm)>1
              and abs(paper_width-height_mm)<=1 and abs(paper_height-width_mm)<=1) then 'orientation'
      when abs(paper_width-width_mm)>1 or abs(paper_height-height_mm)>1 then 'dimensions'
      when not coalesce(case when (layout->>'width') ~ '^[1-9][0-9]{0,8}$'
          and (layout->>'height') ~ '^[1-9][0-9]{0,8}$'
        then abs((layout->>'width')::numeric/(layout->>'height')::numeric
          / (width_mm/nullif(height_mm,0))-1)<=0.01 end,false) then 'canvas_aspect'
      when coalesce(assessed_dpi,0)<=0 or assessed_dpi<required_dpi then 'resolution'
      when required_areas>1 then 'supplier_areas'
      when has_different_area then 'supplier_area_geometry'
      -- A zero Studio border retains the original contain composition. A different
      -- target border needs a derivative, even though the source passed the checks above.
      when border_mm>0 and (fit<>'contain' or embedded_border_mm is null
        or abs(embedded_border_mm-border_mm)>0.15) then 'derived_border'
      when fit='cover' and (embedded_border_mm>0 or layout->>'fitStrategy'='contain') then 'derived_fit'
      else 'available' end eligibility
    from geometry g
  ), best as (
    select e.* from evaluated e
    order by case e.eligibility when 'available' then 0 when 'derived_border' then 1 when 'derived_fit' then 1 else 2 end,
      e.is_current desc, e.assessed_dpi desc, e.generated_at desc,e.revision_id limit 1
  )
  select coalesce((select b.eligibility from best b),
    case when exists(select 1 from revisions) then 'needs_validation' else 'missing' end),
    (select b.revision_id from best b where b.eligibility='available'),
    (select b.assessed_dpi from best b where b.eligibility='available');
$$;

-- The legacy save RPC copies a session-level file onto every variant before
-- inserting its mockup. Route those private print masters through the per-variant
-- resolver while leaving existing and explicitly validated mappings alone.
create or replace function public.link_studio_print_master_on_save()
returns trigger language plpgsql set search_path=public as $$
begin
  with unlinked as (
    update provider_product_mappings m set production_asset_id=null
    from art_assets a, product_discovery_selections chosen
    join product_discovery_candidates c on c.id=chosen.candidate_id
    join product_discovery_sessions s on s.id=c.session_id
    where m.product_variant_id=new.variant_id and chosen.product_variant_id=new.variant_id
      and not m.enabled and m.production_asset_id=a.id and a.id=s.source_asset_id
      and a.storage_bucket='print-masters' and exists (
        select 1 from print_asset_generations g where g.artwork_id=a.artwork_id and g.production_file_path=a.storage_path
      )
    returning a.id
  )
  delete from product_variant_assets asset using unlinked
  where asset.variant_id=new.variant_id and asset.asset_id=unlinked.id and asset.role='production';
  perform link_studio_print_master(new.variant_id);
  return new;
end $$;

commit;
