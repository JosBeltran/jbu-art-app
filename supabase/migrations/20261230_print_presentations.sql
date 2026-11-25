begin;

alter table public.artwork_prints
  add column orientation text check(orientation in ('portrait','landscape','square')),
  add column border_unit text not null default 'none' check(border_unit in ('none','mm','percent')),
  add column border_value numeric not null default 0,
  add column preview_width_px integer check(preview_width_px>0),
  add column preview_height_px integer check(preview_height_px>0),
  add column preview_is_prepared boolean not null default false,
  add constraint print_border_valid check(border_value>=0 and
    ((border_unit='none' and border_value=0) or (border_unit='mm' and border_value<=500) or
      (border_unit='percent' and border_value<50)));

update public.artwork_prints p set
  orientation=case when (g.layout->>'paperWidthMm')::numeric=(g.layout->>'paperHeightMm')::numeric then 'square'
    when (g.layout->>'paperWidthMm')::numeric>(g.layout->>'paperHeightMm')::numeric then 'landscape' else 'portrait' end,
  border_unit=coalesce(g.layout#>>'{borderSpec,unit}','mm'),
  border_value=coalesce((g.layout#>>'{borderSpec,value}')::numeric,
    (select min(value::numeric) from jsonb_each_text(g.layout->'marginsMm')),0),
  preview_is_prepared=(g.layout->>'mode'='preset')
from public.print_asset_generations g where g.print_id=p.id and g.is_current
  and g.layout ?& array['paperWidthMm','paperHeightMm'];

alter function public.save_admin_artwork_print(jsonb,boolean) rename to save_admin_artwork_print_without_presentation;
revoke all on function public.save_admin_artwork_print_without_presentation(jsonb,boolean) from public,anon,authenticated;
create function public.save_admin_artwork_print(_print jsonb,_create boolean)
returns jsonb language plpgsql set search_path=public as $$
declare result jsonb;
begin
  result:=save_admin_artwork_print_without_presentation(_print-array['orientation','border_unit','border_value','preview_width_px','preview_height_px','preview_is_prepared'],_create);
  update artwork_prints set
    orientation=case when _print ? 'orientation' then nullif(_print->>'orientation','') else orientation end,
    border_unit=coalesce(_print->>'border_unit',border_unit),
    border_value=coalesce((_print->>'border_value')::numeric,border_value),
    preview_width_px=coalesce((_print->>'preview_width_px')::integer,preview_width_px),
    preview_height_px=coalesce((_print->>'preview_height_px')::integer,preview_height_px),
    preview_is_prepared=coalesce((_print->>'preview_is_prepared')::boolean,preview_is_prepared)
  where id=(result->>'id')::uuid returning to_jsonb(artwork_prints.*) into result;
  return result;
end $$;
revoke all on function public.save_admin_artwork_print(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_admin_artwork_print(jsonb,boolean) to service_role;

create function public.guard_print_presentation() returns trigger language plpgsql set search_path=public as $$
begin
  if (new.orientation,new.border_unit,new.border_value) is distinct from (old.orientation,old.border_unit,old.border_value)
    and exists(select 1 from product_variants where artwork_print_id=old.id)
    and not (old.orientation is null and new.orientation is not null and
      (new.border_unit,new.border_value) is not distinct from (old.border_unit,old.border_value))
    then raise exception 'print_identity_locked'; end if;
  if new.size_code is not null and exists(select 1 from artwork_print_sizes s where s.code=new.size_code and
    new.border_unit='mm' and 2*new.border_value>=s.width_mm) then raise exception 'invalid_print_border'; end if;
  return new;
end $$;
create trigger guard_print_presentation before update on public.artwork_prints for each row execute function public.guard_print_presentation();

alter table public.product_discovery_selections add column artwork_print_id uuid references public.artwork_prints(id) on delete restrict;
update public.product_discovery_selections s set artwork_print_id=v.artwork_print_id from public.product_variants v where v.id=s.product_variant_id;
alter table public.product_discovery_selections drop constraint product_discovery_selections_pkey;
alter table public.product_discovery_selections add primary key(product_variant_id);
create unique index discovery_selection_print_identity on public.product_discovery_selections(candidate_id,configuration,artwork_print_id) where artwork_print_id is not null;
create unique index discovery_selection_legacy_identity on public.product_discovery_selections(candidate_id,configuration) where artwork_print_id is null;

create or replace function public.set_studio_print_selection(_actor uuid,_session uuid,_candidate uuid,_configuration jsonb,_artwork_print uuid)
returns boolean language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; manifest jsonb;
begin
  select * into workspace from product_discovery_sessions where id=_session for update;
  if _actor is null or not found or workspace.created_by<>_actor or workspace.state not in ('open','review') then raise exception 'wall_art_session_invalid'; end if;
  perform 1 from product_discovery_candidates where id=_candidate and session_id=_session;
  if not found or jsonb_typeof(_configuration) is distinct from 'object' then raise exception 'wall_art_candidate_invalid'; end if;
  perform 1 from artwork_prints where id=_artwork_print and artwork_id=workspace.artwork_id and is_active and size_code is not null for share;
  if not found then raise exception 'studio_artwork_print_required'; end if;
  manifest:=coalesce(workspace.criteria->'matrixSelections','[]');
  if exists(select 1 from jsonb_array_elements(manifest) e where e->>'candidateId'=_candidate::text and e->'configuration'=_configuration and e->>'artworkPrintId'=_artwork_print::text) then return true; end if;
  if jsonb_array_length(manifest)>=12 then raise exception 'wall_art_selection_invalid'; end if;
  manifest:=manifest||jsonb_build_array(jsonb_build_object('candidateId',_candidate,'configuration',_configuration,'artworkPrintId',_artwork_print));
  update product_discovery_sessions set criteria=jsonb_set(criteria,'{matrixSelections}',manifest) where id=_session;
  return true;
end $$;
create function public.remove_studio_print_selection(_actor uuid,_session uuid,_candidate uuid,_configuration jsonb,_artwork_print uuid)
returns boolean language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; manifest jsonb;
begin
  select * into workspace from product_discovery_sessions where id=_session for update;
  if _actor is null or not found or workspace.created_by<>_actor or workspace.state not in ('open','review') then raise exception 'wall_art_session_invalid'; end if;
  select coalesce(jsonb_agg(e),'[]') into manifest from jsonb_array_elements(coalesce(workspace.criteria->'matrixSelections','[]')) e
    where not(e->>'candidateId'=_candidate::text and e->'configuration'=_configuration and e->>'artworkPrintId'=_artwork_print::text);
  update product_discovery_sessions set criteria=jsonb_set(criteria,'{matrixSelections}',manifest) where id=_session;
  return true;
end $$;
revoke all on function public.set_studio_print_selection(uuid,uuid,uuid,jsonb,uuid),public.remove_studio_print_selection(uuid,uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.set_studio_print_selection(uuid,uuid,uuid,jsonb,uuid),public.remove_studio_print_selection(uuid,uuid,uuid,jsonb,uuid) to service_role;

create function public.commit_prepared_print_files(_print uuid,_expected uuid,_request uuid,_by uuid,
  _preview text,_master text,_layout jsonb,_source jsonb,_new_preview boolean,_preview_width integer,_preview_height integer)
returns jsonb language plpgsql set search_path=public as $$
declare p artwork_prints; g print_asset_generations; revision uuid; preview text;
begin
  select * into p from artwork_prints where id=_print for update;
  if not found or p.size_code is null or _request is null or _by is null or nullif(_preview,'') is null
    or _layout->>'algorithmVersion' is distinct from '3' or _layout->>'size' is distinct from p.size_code
    or _layout->>'orientation' not in ('portrait','landscape','square') or _source->>'sha256' !~ '^[a-f0-9]{64}$'
    then raise exception 'invalid_print_size'; end if;
  if p.orientation is not null and p.orientation is distinct from _layout->>'orientation' then raise exception 'print_specs_locked'; end if;
  if _master is not null and (_master<>'attached/'||p.artwork_id::text||'/'||p.id::text||'/'||(_source->>'uploadId')||'/master'
    or coalesce((_source->>'effectiveDpi')::numeric,0)<149.5) then raise exception 'invalid_print_size'; end if;
  select * into g from print_asset_generations where print_id=p.id and is_current for update;
  if g.production_file_path is not null then
    if g.master_source_ref->>'uploadId'=_source->>'uploadId' then return jsonb_build_object('printId',p.id,'revisionId',g.revision_id,'preview',g.preview_image_url); end if;
    raise exception 'master_already_exists';
  end if;
  if g.revision_id is distinct from _expected then raise exception 'layout_changed'; end if;
  if g.production_status='MASTER_GENERATING' and g.master_lease_until>now() then raise exception 'master_busy'; end if;
  if g.revision_id is not null and not _new_preview then
    -- Completing a preview-only presentation preserves its revision and every source reference.
    preview:=g.preview_image_url;
    update print_asset_generations set production_file_path=_master,layout=_layout,
      effective_dpi=floor((_source->>'effectiveDpi')::numeric),
      production_status=case when _master is null then 'PREVIEW_ONLY' else 'MASTER_READY' end,
      master_source_ref=case when _master is not null then _source end,master_approved_at=case when _master is not null then now() end,
      master_lease=null,master_lease_until=null,master_error=null where revision_id=g.revision_id;
    revision:=g.revision_id;
  else
    update print_asset_generations set is_current=false where print_id=p.id and is_current;
    preview:=_preview;
    insert into print_asset_generations(request_id,size,artwork_id,print_id,production_file_path,preview_image_url,source_image_ref,
      border_mode,effective_dpi,generated_by,layout,production_status,master_source_ref,master_approved_at)
    values(_request,p.size_code,p.artwork_id,p.id,_master,preview,_source,'fit',coalesce(floor((_source->>'effectiveDpi')::numeric),0),_by,_layout,
      case when _master is null then 'PREVIEW_ONLY' else 'MASTER_READY' end,case when _master is not null then _source end,
      case when _master is not null then now() end) returning revision_id into revision;
  end if;
  update artwork_prints set orientation=_layout->>'orientation',image_url=preview,preview_is_prepared=true,
    preview_width_px=_preview_width,preview_height_px=_preview_height,
    print_gallery_image_id=null,print_provenance_image_id=null where id=p.id;
  return jsonb_build_object('printId',p.id,'revisionId',revision,'preview',preview);
end $$;
revoke all on function public.commit_prepared_print_files(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,boolean,integer,integer) from public,anon,authenticated;
grant execute on function public.commit_prepared_print_files(uuid,uuid,uuid,uuid,text,text,jsonb,jsonb,boolean,integer,integer) to service_role;

-- Function bodies for generation and studio saves follow below.

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
      if workspace.criteria ? 'matrixSelections' and not exists(select 1 from jsonb_array_elements(coalesce(workspace.criteria->'matrixSelections','[]')) entry
        where entry->>'candidateId'=candidate.id::text and entry->'configuration'=coalesce(v->'configuration','{}')
          and entry->>'artworkPrintId'=source_print.id::text)
        then raise exception 'studio_artwork_print_required'; end if;
      if source_print.orientation is not null and v->'attributes'->>'orientation' is not null and source_print.orientation is distinct from
        (case lower(v->'attributes'->>'orientation') when 'hor' then 'landscape' when 'ver' then 'portrait' else lower(v->'attributes'->>'orientation') end)
        then raise exception 'studio_orientation_conflict'; end if;
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
      insert into product_discovery_selections(candidate_id,configuration,product_variant_id,approved_by,artwork_print_id)
      values(candidate.id,coalesce(v->'configuration','{}'),variant_id,_actor,source_print.id);
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
      values(variant_id,coalesce(nullif(source_print.image_url,''),(select image_url from artwork_images where id=source_print.print_gallery_image_id and artwork_id=workspace.artwork_id),(select image_url from provenance_event_images_public where id=source_print.print_provenance_image_id and artwork_id=workspace.artwork_id),(select preview_image_url from print_asset_generations where print_id=source_print.id and is_current),source_url),array(select jsonb_array_elements_text(v->'scenes')),v->>'primaryScene','contain',
        case when jsonb_typeof(spec->'widthMm')='number' and (spec->>'widthMm')::numeric>0 then (spec->>'widthMm')::numeric end,
        case when jsonb_typeof(spec->'heightMm')='number' and (spec->>'heightMm')::numeric>0 then (spec->>'heightMm')::numeric end,case when source_print.preview_is_prepared then 0 when source_print.border_unit='percent' then round(source_size.width_mm*source_print.border_value/100)::integer when source_print.border_unit='mm' then round(source_print.border_value)::integer else 0 end);

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
  if _request is null or _by is null or _new_print is null or _size is null or not exists(select 1 from artwork_print_sizes where code=_size)
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
    and coalesce(v.size_code,normalized_artwork_print_size(v.size))=_size
      and (_layout->>'mode'<>'preset' or (
        abs((case v.border_unit when 'percent' then (select width_mm from artwork_print_sizes where code=_size)*v.border_value/100 when 'mm' then v.border_value else 0 end)
          -(case _layout#>>'{borderSpec,unit}' when 'percent' then (select width_mm from artwork_print_sizes where code=_size)*(_layout#>>'{borderSpec,value}')::numeric/100
            when 'mm' then (_layout#>>'{borderSpec,value}')::numeric else 0 end))<0.1
        and (v.orientation is null or v.orientation=_layout->>'orientation')));

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

  update artwork_prints set orientation=_layout->>'orientation',
    border_unit=coalesce(_layout#>>'{borderSpec,unit}','mm'),
    border_value=coalesce((_layout#>>'{borderSpec,value}')::numeric,(select min(value::numeric) from jsonb_each_text(_layout->'marginsMm')),0),
    preview_is_prepared=(_layout->>'mode'='preset') where id=variant.id;
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
