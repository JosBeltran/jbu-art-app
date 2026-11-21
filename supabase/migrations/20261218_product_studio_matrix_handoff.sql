-- New drafts only. Existing IDs, prices, mappings, images and approvals are untouched.
begin;
create or replace function public.save_wall_art_studio(_actor uuid,_session uuid,_products jsonb)
returns uuid[] language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; saved uuid[]; p jsonb; v jsonb; price jsonb;
  candidate product_discovery_candidates; spec jsonb; product_id uuid; variant_id uuid; book price_books; source_url text;
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
      variant_id:=gen_random_uuid();
      insert into product_variants(id,product_id,sku,title,fulfillment_type,inventory_policy,allowed_countries)
      values(variant_id,product_id,'WALL-'||upper(variant_id::text),left(coalesce(v->>'title',spec->>'title'),240),'provider','made_to_order',
        case when jsonb_array_length(v->'prices')>0 then
          array(select distinct b.country from jsonb_array_elements(v->'prices') entry join price_books b on b.id=(entry->>'bookId')::uuid where b.country is not null)
        else array(select country from (select workspace.criteria->'countries'->>0 country) chosen where country is not null) end);
      insert into provider_product_mappings(product_variant_id,provider_code,external_id,external_variant_id,external_configuration,production_asset_id)
      values(variant_id,candidate.provider_code,candidate.external_id,candidate.external_variant_id,coalesce(v->'configuration','{}'),
        (select id from art_assets where id=workspace.source_asset_id and artwork_id=workspace.artwork_id
          and visibility='private' and asset_type='production_derivative' and processing_status='ready'));
      -- Preserve the selected ready private asset without certifying supplier mapping.
      insert into product_variant_assets(variant_id,asset_id,role)
      select variant_id,a.id,'production' from art_assets a
      where a.id=workspace.source_asset_id and a.artwork_id=workspace.artwork_id
        and a.visibility='private' and a.asset_type='production_derivative' and a.processing_status='ready';
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
      insert into wall_art_mockups(variant_id,source_url,scenes,primary_scene,fit,width_mm,height_mm)
      values(variant_id,source_url,array(select jsonb_array_elements_text(v->'scenes')),v->>'primaryScene',v->>'fit',
        case when jsonb_typeof(spec->'widthMm')='number' and (spec->>'widthMm')::numeric>0 then (spec->>'widthMm')::numeric end,
        case when jsonb_typeof(spec->'heightMm')='number' and (spec->>'heightMm')::numeric>0 then (spec->>'heightMm')::numeric end);

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

-- Only uncommitted native candidates can be reverified after a source refresh.
-- Lock the workspace before the candidate, in the same order as draft creation.
create function public.refresh_studio_candidate(_actor uuid,_candidate uuid,_snapshot jsonb,_compatibility jsonb)
returns jsonb language plpgsql set search_path=public as $$
declare candidate product_discovery_candidates; workspace product_discovery_sessions; session_id uuid;
begin
  select c.session_id into session_id from product_discovery_candidates c where c.id=_candidate;
  select * into workspace from product_discovery_sessions s where s.id=session_id for update;
  if _actor is null or not found or workspace.created_by<>_actor or workspace.state not in ('open','review') then
    raise exception 'wall_art_session_invalid'; end if;
  select * into candidate from product_discovery_candidates c where c.id=_candidate for update;
  if not found or candidate.catalog_snapshot->>'mode' is distinct from 'native_v1'
    or _snapshot->>'mode' is distinct from 'native_v1'
    or _snapshot->>'groupKey' is distinct from candidate.catalog_snapshot->>'groupKey'
    or _snapshot->'variant'->>'externalVariantId' is distinct from candidate.external_variant_id
    or exists(select 1 from product_discovery_selections s where s.candidate_id=_candidate) then
    raise exception 'candidate_revision_changed'; end if;
  update product_discovery_candidates c set catalog_snapshot=_snapshot,compatibility=_compatibility where c.id=_candidate returning * into candidate;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'refresh_studio_candidate',_candidate);
  return to_jsonb(candidate);
end $$;
revoke all on function public.refresh_studio_candidate(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.refresh_studio_candidate(uuid,uuid,jsonb,jsonb) to service_role;

-- Persist exact staging choices in the existing workspace, including options that
-- share one supplier variant. This is not another variant/catalog table.
create function public.set_studio_matrix_selection(_actor uuid,_session uuid,_candidate uuid,_configuration jsonb,_selected boolean)
returns boolean language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; candidate product_discovery_candidates; manifest jsonb;
begin
  select * into workspace from product_discovery_sessions s where s.id=_session for update;
  if _actor is null or not found or workspace.created_by<>_actor or workspace.state not in ('open','review') then raise exception 'wall_art_session_invalid'; end if;
  select * into candidate from product_discovery_candidates c where c.id=_candidate and c.session_id=_session;
  if not found then raise exception 'wall_art_candidate_invalid'; end if;
  if _selected and _configuration<>'{}'::jsonb and not exists(
    select 1 from jsonb_array_elements(coalesce(candidate.catalog_snapshot->'variant'->'combinations','[]')) combo where combo->'attributes'=_configuration
  ) then raise exception 'wall_art_selection_invalid'; end if;
  manifest:=workspace.criteria->'matrixSelections';
  if manifest is null then
    select coalesce(jsonb_agg(jsonb_build_object('candidateId',c.id,'configuration',coalesce(c.catalog_snapshot->'configuration','{}'),
      'presentationId',c.catalog_snapshot->>'groupKey')),'[]') into manifest from product_discovery_candidates c
      where c.session_id=_session and c.compatibility->>'status' is distinct from 'incompatible'
        and not exists(select 1 from product_discovery_selections chosen where chosen.candidate_id=c.id);
  end if;
  select coalesce(jsonb_agg(entry),'[]') into manifest from jsonb_array_elements(manifest) entry
    where not(entry->>'candidateId'=_candidate::text and entry->'configuration'=_configuration);
  if _selected then manifest:=manifest||jsonb_build_array(jsonb_build_object('candidateId',_candidate,'configuration',_configuration,'presentationId',candidate.catalog_snapshot->>'groupKey')); end if;
  if jsonb_array_length(manifest)>12 and _selected then raise exception 'wall_art_selection_invalid'; end if;
  update product_discovery_sessions s set criteria=jsonb_set(s.criteria,'{matrixSelections}',manifest) where s.id=_session;
  return true;
end $$;
revoke all on function public.set_studio_matrix_selection(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.set_studio_matrix_selection(uuid,uuid,uuid,jsonb,boolean) to service_role;

revoke all on function public.save_wall_art_studio(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_wall_art_studio(uuid,uuid,jsonb) to service_role;
commit;
