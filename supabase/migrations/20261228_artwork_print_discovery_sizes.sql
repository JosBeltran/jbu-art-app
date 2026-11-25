begin;

create table public.artwork_print_sizes (
  code text primary key, width_mm numeric not null check (width_mm>0),
  height_mm numeric not null check (height_mm>=width_mm)
);
insert into public.artwork_print_sizes values
('A5',148,210),
('A6',105,148),
('A2',420,594),
('A1',594,841),
('A0',841,1189),
('A3',297,420),
('A4',210,297),
('30X40CM',300,400),
('30X30CM',300,300),
('12X16IN',304.8,406.4),
('20X30CM',200,300),
('30X45CM',300,450),
('30X50CM',300,500),
('40X50CM',400,500),
('40X60CM',400,600),
('50X70CM',500,700),
('50X75CM',500,750),
('60X80CM',600,800),
('60X90CM',600,900),
('70X100CM',700,1000),
('8X10IN',203.2,254),
('16X20IN',406.4,508),
('18X24IN',457.2,609.6),
('20X30IN',508,762),
('24X36IN',609.6,914.4);
alter table public.artwork_print_sizes enable row level security;
revoke all on public.artwork_print_sizes from public,anon,authenticated;
grant select on public.artwork_print_sizes to service_role;

alter table public.artwork_prints add column size_code text references public.artwork_print_sizes(code);
alter table public.product_variants add column artwork_print_id uuid references public.artwork_prints(id) on delete restrict;
create index product_variant_artwork_print_idx on public.product_variants(artwork_print_id) where artwork_print_id is not null;

create function public.normalized_artwork_print_size(_label text)
returns text language sql stable set search_path=public as $$
  select s.code from artwork_print_sizes s where s.code =
    coalesce(substring(upper(btrim(_label)) from '^(A[0-6])(?:[^A-Z0-9]|$)'),
      replace(regexp_replace(split_part(split_part(upper(btrim(_label)),'·',1),'|',1),'[[:space:]]','','g'),'×','X'))
  limit 1
$$;
update public.artwork_prints set size_code=normalized_artwork_print_size(size) where size_code is null;

-- Preserve the established commercial save, including shipping and identity guards.
alter function public.save_admin_artwork_print(jsonb,boolean) rename to save_admin_artwork_print_without_size;
revoke all on function public.save_admin_artwork_print_without_size(jsonb,boolean) from public,anon,authenticated;
create function public.save_admin_artwork_print(_print jsonb,_create boolean)
returns jsonb language plpgsql set search_path=public as $$
declare result jsonb; code text;
begin
  result:=save_admin_artwork_print_without_size(_print-'size_code',_create);
  code:=case when _print ? 'size_code' then nullif(_print->>'size_code','')
    else coalesce(result->>'size_code',normalized_artwork_print_size(result->>'size')) end;
  update artwork_prints set size_code=code where id=(result->>'id')::uuid returning to_jsonb(artwork_prints.*) into result;
  return result;
end $$;
revoke all on function public.save_admin_artwork_print(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_admin_artwork_print(jsonb,boolean) to service_role;

-- Size codes must continue to describe the print and any existing production canvas.
create function public.guard_artwork_print_size_reference() returns trigger
language plpgsql set search_path=public as $$
declare preset artwork_print_sizes; g print_asset_generations;
begin
  if tg_op='INSERT' and new.size_code is null then new.size_code:=normalized_artwork_print_size(new.size); end if;
  if tg_op='UPDATE' and (new.size_code,new.artwork_id) is distinct from (old.size_code,old.artwork_id)
    and exists(select 1 from product_variants where artwork_print_id=old.id)
    then raise exception 'print_identity_locked'; end if;
  if new.size_code is not null then
    select * into preset from artwork_print_sizes where code=new.size_code;
    if not found then raise exception 'invalid_print_size'; end if;
    select * into g from print_asset_generations where print_id=new.id and is_current;
    if found and g.layout ? 'paperWidthMm' and (
      abs(least((g.layout->>'paperWidthMm')::numeric,(g.layout->>'paperHeightMm')::numeric)-preset.width_mm)>1 or
      abs(greatest((g.layout->>'paperWidthMm')::numeric,(g.layout->>'paperHeightMm')::numeric)-preset.height_mm)>1)
      then raise exception 'print_specs_locked'; end if;
  end if;
  return new;
end $$;
create trigger guard_artwork_print_size_reference before insert or update of size_code,size,artwork_id
on public.artwork_prints for each row execute function public.guard_artwork_print_size_reference();

create function public.guard_studio_artwork_print_identity() returns trigger
language plpgsql set search_path=public as $$
begin
  if old.artwork_print_id is not null and new.artwork_print_id is distinct from old.artwork_print_id
    then raise exception 'print_identity_locked'; end if;
  return new;
end $$;
create trigger guard_studio_artwork_print_identity before update of artwork_print_id on public.product_variants
for each row execute function public.guard_studio_artwork_print_identity();

-- Reuse the exact matrix manifest; each configuration pins the chosen print ID.
create function public.set_studio_print_selection(_actor uuid,_session uuid,_candidate uuid,_configuration jsonb,_artwork_print uuid)
returns boolean language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; manifest jsonb; prior uuid;
begin
  select * into workspace from product_discovery_sessions where id=_session for update;
  if not found or workspace.created_by<>_actor or workspace.state not in ('open','review')
    then raise exception 'wall_art_session_invalid'; end if;
  perform 1 from artwork_prints where id=_artwork_print and artwork_id=workspace.artwork_id
    and is_active and size_code is not null for share;
  if not found then raise exception 'studio_artwork_print_required'; end if;
  select (entry->>'artworkPrintId')::uuid into prior
    from jsonb_array_elements(coalesce(workspace.criteria->'matrixSelections','[]')) entry
    where entry->>'candidateId'=_candidate::text and entry->'configuration'=_configuration;
  if prior is not null and prior<>_artwork_print then raise exception 'studio_artwork_print_required'; end if;
  perform set_studio_matrix_selection(_actor,_session,_candidate,_configuration,true);
  select criteria->'matrixSelections' into manifest from product_discovery_sessions where id=_session;
  select jsonb_agg(case when entry->>'candidateId'=_candidate::text and entry->'configuration'=_configuration
    then entry||jsonb_build_object('artworkPrintId',_artwork_print) else entry end)
    into manifest from jsonb_array_elements(manifest) entry;
  update product_discovery_sessions set criteria=jsonb_set(criteria,'{matrixSelections}',manifest) where id=_session;
  return true;
end $$;
revoke all on function public.set_studio_print_selection(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.set_studio_print_selection(uuid,uuid,uuid,jsonb,uuid) to service_role;

create or replace function public.save_wall_art_studio_core(_actor uuid,_session uuid,_products jsonb)
returns uuid[] language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; saved uuid[]; p jsonb; v jsonb; price jsonb;
  candidate product_discovery_candidates; spec jsonb; product_id uuid; variant_id uuid; book price_books; source_url text; source_print artwork_prints; source_size artwork_print_sizes;
begin
  select * into workspace from product_discovery_sessions where id=_session for update;
  if _actor is null or not found or workspace.created_by<>_actor or workspace.artwork_id is null
    or workspace.state='archived' then
    raise exception 'wall_art_session_invalid';
  end if;
  select s.product_ids into saved from wall_art_studio_saves s where session_id=_session;
  if found then return saved; end if;

  source_url:=nullif(workspace.criteria#>>'{previewImage,url}','');
  if source_url is null then select primary_image_url into source_url from artworks where id=workspace.artwork_id; end if;
  if nullif(trim(source_url),'') is null then raise exception 'public_image_required'; end if;
  saved:=array[]::uuid[];
  for p in select value from jsonb_array_elements(_products) loop
    product_id:=gen_random_uuid();
    insert into products(id,sku,family_code,title_es,title_en,description_es,description_en,created_by)
    values(product_id,'WALL-'||upper(product_id::text),p->>'family',p->>'titleEs',p->>'titleEn',p->>'descriptionEs',p->>'descriptionEn',_actor);
    insert into artwork_products(artwork_id,product_id,relationship_type,is_primary)
    values(workspace.artwork_id,product_id,'derived',true);
    saved:=array_append(saved,product_id);

    for v in select value from jsonb_array_elements(p->'variants') loop
      select * into candidate from product_discovery_candidates c
        where c.id=(v->>'candidateId')::uuid and c.session_id=_session and coalesce(workspace.criteria->'providers','["gelato"]') ? c.provider_code
          and c.compatibility->>'status' is distinct from 'incompatible';
      if not found then raise exception 'wall_art_candidate_invalid'; end if;
      if v ? 'sourceSnapshot' and candidate.catalog_snapshot is distinct from v->'sourceSnapshot' then raise exception 'candidate_revision_changed'; end if;

      select coalesce(candidate.catalog_snapshot->'variant',specification) into spec from provider_catalog_variants
        where provider_code=candidate.provider_code and external_id=candidate.external_id and external_variant_id=candidate.external_variant_id;
      select * into source_print from artwork_prints
        where id=(v->>'artworkPrintId')::uuid and artwork_id=workspace.artwork_id and is_active for share;
      if not found or source_print.size_code is null then raise exception 'studio_artwork_print_required'; end if;
      if exists(select 1 from jsonb_array_elements(coalesce(workspace.criteria->'matrixSelections','[]')) entry
        where entry->>'candidateId'=candidate.id::text and entry->'configuration'=coalesce(v->'configuration','{}')
          and entry->>'artworkPrintId' is not null and entry->>'artworkPrintId'<>source_print.id::text)
        then raise exception 'studio_artwork_print_required'; end if;
      select * into source_size from artwork_print_sizes where code=source_print.size_code;
      if jsonb_typeof(spec->'widthMm') is distinct from 'number' or jsonb_typeof(spec->'heightMm') is distinct from 'number'
        or abs(least((spec->>'widthMm')::numeric,(spec->>'heightMm')::numeric)-source_size.width_mm)>1
        or abs(greatest((spec->>'widthMm')::numeric,(spec->>'heightMm')::numeric)-source_size.height_mm)>1
      then raise exception 'studio_artwork_print_required'; end if;
      variant_id:=gen_random_uuid();
      insert into product_variants(id,product_id,sku,title,fulfillment_type,inventory_policy,artwork_print_id,allowed_countries)
      values(variant_id,product_id,'WALL-'||upper(variant_id::text),left(coalesce(v->>'title',spec->>'title'),240),'provider','made_to_order',source_print.id,
        case when jsonb_array_length(v->'prices')>0 then
          array(select distinct b.country from jsonb_array_elements(v->'prices') entry join price_books b on b.id=(entry->>'bookId')::uuid where b.country is not null)
        else array(select country from (select workspace.criteria->'countries'->>0 country) chosen where country is not null) end);
      insert into provider_product_mappings(product_variant_id,provider_code,external_id,external_variant_id,external_configuration,production_asset_id)
      values(variant_id,candidate.provider_code,candidate.external_id,candidate.external_variant_id,coalesce(v->'configuration','{}'),
        (select id from art_assets where id=workspace.source_asset_id and artwork_id=workspace.artwork_id
          and visibility='private' and asset_type='production_derivative' and processing_status='ready' and source_print.id is null
          and coalesce((v->>'borderMm')::integer,0)=0));
      -- Preserve the selected ready private asset without certifying supplier mapping.
      insert into product_variant_assets(variant_id,asset_id,role)
      select variant_id,a.id,'production' from art_assets a
      where a.id=workspace.source_asset_id and a.artwork_id=workspace.artwork_id
        and a.visibility='private' and a.asset_type='production_derivative' and a.processing_status='ready' and source_print.id is null
        and coalesce((v->>'borderMm')::integer,0)=0;
      insert into product_discovery_selections(candidate_id,configuration,product_variant_id,approved_by)
      values(candidate.id,coalesce(v->'configuration','{}'),variant_id,_actor);
      insert into product_variant_attribute_values(variant_id,attribute_code,text_value)
      select variant_id,pa.code,left(attr.value,240)
      from jsonb_each_text(coalesce(v->'attributes','{}')) attr
      join product_attributes pa on pa.code=case attr.key when 'mount' then 'mat' else attr.key end and pa.value_type='string'
      where nullif(trim(attr.value),'') is not null on conflict do nothing;
      insert into product_variant_attribute_values(variant_id,attribute_code,enum_value)
      select variant_id,'orientation',o.code from product_attribute_values o
      where o.attribute_code='orientation' and o.code=case lower(v->'attributes'->>'orientation')
        when 'hor' then 'landscape' when 'ver' then 'portrait' else lower(v->'attributes'->>'orientation') end
      on conflict do nothing;
      insert into wall_art_mockups(variant_id,source_url,scenes,primary_scene,fit,width_mm,height_mm,border_mm)
      values(variant_id,source_url,array(select jsonb_array_elements_text(v->'scenes')),v->>'primaryScene',v->>'fit',
        case when jsonb_typeof(spec->'widthMm')='number' and (spec->>'widthMm')::numeric>0 then (spec->>'widthMm')::numeric end,
        case when jsonb_typeof(spec->'heightMm')='number' and (spec->>'heightMm')::numeric>0 then (spec->>'heightMm')::numeric end,coalesce((v->>'borderMm')::integer,0));

      for price in select value from jsonb_array_elements(v->'prices') loop
        select * into book from price_books where id=(price->>'bookId')::uuid
          and country is not null and status in ('active','draft') for share;
        if not found then raise exception 'price_book_unavailable'; end if;
        insert into price_book_entries(price_book_id,product_variant_id,amount_minor)
        values(book.id,variant_id,(price->>'amountMinor')::bigint);
      end loop;
    end loop;
    insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'create_wall_art_draft',product_id);
  end loop;

  insert into wall_art_studio_saves values(_session,saved);
  update product_discovery_sessions set state='drafted' where id=_session;
  return saved;
end $$;



-- A later master lookup is restricted to the selected Artwork Print. Historical
-- products without this new reference retain the established resolver behavior.
create or replace function public.studio_print_master_resolution(_variant uuid)
returns table(status text, revision_id uuid, effective_dpi numeric) language sql stable set search_path=public as $$
  with configuration as (
    select session.artwork_id, v.artwork_print_id, w.*, upper(trim(a.text_value)) target_size, orientation.enum_value target_orientation,
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
    join artwork_prints p on p.artwork_id=config.artwork_id and (config.artwork_print_id is null or p.id=config.artwork_print_id)
    left join print_asset_generations g on g.print_id=p.id and g.artwork_id=p.artwork_id
      and (p.size_code=upper(btrim(g.size)) or upper(btrim(p.size))=upper(btrim(g.size)) or
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
        or coalesce(p.size_code,substring(upper(btrim(p.size)) from '^(A[0-9]+)(?:[^A-Z0-9]|$)'))=config.target_size)
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

create or replace function public.commit_print_asset_revision(
  _artwork uuid, _request uuid, _by uuid, _new_print uuid, _size text, _edition text,
  _selected uuid, _replace boolean, _expected_revision uuid,
  _master text, _preview text, _source jsonb, _border text, _dpi integer,
  _title text, _description text, _price numeric, _limit integer, _layout jsonb
) returns jsonb language plpgsql set search_path = public as $$
declare
  parent public.artworks;
  variant public.artwork_prints;
  edition_value public.artwork_prints;
  saved public.print_asset_generations;
  current_revision uuid;
  candidates uuid[];
begin
  if _request is null or _by is null or _new_print is null or _size is null or _size not in ('A0','A1','A2','A3','A4','30X40CM','30X30CM','12X16IN')
    or _edition is null or _edition not in ('OPEN','LIMITED') or (_price is not null and _price <= 0)
    or (_selected is null and _edition = 'LIMITED' and coalesce(_limit, 0) < 1)
    or _replace is null or _master = '' or nullif(_preview,'') is null
    or jsonb_typeof(_layout) is distinct from 'object'
    or _layout->>'algorithmVersion' is distinct from '1'
    or _layout->>'size' is distinct from _size
    or not (_layout ?& array['width','height','left','top','artworkWidth','artworkHeight',
      'paperWidthMm','paperHeightMm','outputDpi','minimumEffectiveDpi','marginsMm','paperType'])
    or _source->>'sha256' is null then
    raise exception 'invalid_options';
  end if;

  -- The normal admin print manager uses the same artwork-row lock.
  select * into parent from public.artworks where id = _artwork for update;
  if not found then raise exception 'artwork_not_found'; end if;
  select * into saved from public.print_asset_generations where request_id = _request and size = _size;
  if found then
    if saved.artwork_id <> _artwork or saved.generated_by <> _by then raise exception 'generation_conflict'; end if;
    return to_jsonb(saved);
  end if;

  -- Match legacy size labels such as "A2 · 42 × 59.4 cm" as well as bare A2.
  select array_agg(v.id order by v.id) into candidates from public.artwork_prints v
  where v.artwork_id = _artwork and v.edition_type::text = _edition and v.finish::text = 'FINE_ART'
    and coalesce(v.size_code,normalized_artwork_print_size(v.size))=_size;

  if _selected is null and coalesce(cardinality(candidates),0) > 0 then
    raise exception 'generation_conflict';
  end if;

  if _selected is not null then
    if not _replace or not coalesce(_selected = any(candidates), false) then
      raise exception 'generation_conflict';
    end if;
    select * into variant from public.artwork_prints where id = _selected for update;
    if not found or variant.artwork_id <> _artwork or variant.edition_type::text <> _edition
      or variant.finish::text <> 'FINE_ART' or coalesce(variant.size_code,normalized_artwork_print_size(variant.size)) is distinct from _size then
      raise exception 'generation_conflict';
    end if;
    select revision_id into current_revision from public.print_asset_generations
    where print_id = variant.id and is_current;
    if current_revision is distinct from _expected_revision then raise exception 'generation_conflict'; end if;

    -- Keep prior revisions usable for orders which already selected them.
    update public.print_asset_generations set is_current = false,
      production_status = case when production_status in ('PREVIEW_ONLY','MASTER_PENDING','MASTER_FAILED')
        then 'MASTER_STALE' else production_status end
    where print_id = variant.id and is_current;

    -- Commercial fields and variant identity are preserved, even when already sold.
    update public.artwork_prints set image_url = _preview, paper_type = _layout->>'paperType',
      print_gallery_image_id = null, print_provenance_image_id = null
    where id = variant.id;
  else
    edition_value := jsonb_populate_record(null::public.artwork_prints, jsonb_build_object('edition_type', _edition));
    insert into public.artwork_prints (
      id, artwork_id, size, finish, edition_type, price, currency, is_active, title, title_en,
      description, description_en, paper_type, max_edition_size, image_url
    ) values (
      _new_print, _artwork, _size, 'FINE_ART', edition_value.edition_type,
      _price, 'MXN', false,
      coalesce(nullif(btrim(_title),''), left(parent.title, 194) || ' · ' || _size),
      case when nullif(btrim(_title),'') is null and nullif(parent.title_en,'') is not null
        then left(parent.title_en,194) || ' · ' || _size end,
      coalesce(nullif(btrim(_description),''), parent.description),
      case when nullif(btrim(_description),'') is null then parent.description_en end,
      _layout->>'paperType', case when _edition = 'LIMITED' then _limit end, _preview
    ) returning * into variant;
  end if;

  insert into public.print_asset_generations (
    request_id, size, artwork_id, print_id, production_file_path, preview_image_url,
    source_image_ref, border_mode, effective_dpi, generated_by, layout, production_status, master_source_ref, master_approved_at
  ) values (_request, _size, _artwork, variant.id, _master, _preview, _source, _border, _dpi, _by, _layout,
    case when _master is null then 'PREVIEW_ONLY' else 'MASTER_READY' end,
    case when _master is not null then _source end, case when _master is not null then now() end)
  returning * into saved;
  return to_jsonb(saved);
end $$;

revoke all on function public.commit_print_asset_revision(uuid,uuid,uuid,uuid,text,text,uuid,boolean,uuid,text,text,jsonb,text,integer,text,text,numeric,integer,jsonb) from public,anon,authenticated;
grant execute on function public.commit_print_asset_revision(uuid,uuid,uuid,uuid,text,text,uuid,boolean,uuid,text,text,jsonb,text,integer,text,text,numeric,integer,jsonb) to service_role;

notify pgrst,'reload schema';
commit;

