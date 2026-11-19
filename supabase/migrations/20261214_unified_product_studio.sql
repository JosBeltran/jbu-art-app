begin;

insert into public.product_attributes(code,label_es,label_en,value_type,measurement_unit)
values('paper','Papel','Paper','string',null),('frame_material','Material del marco','Frame material','string',null),
  ('glazing','Cubierta','Glazing','string',null)
on conflict (code) do nothing;
insert into public.product_family_attributes(family_code,attribute_code)
select 'framed_print',code from unnest(array['paper','frame_material','glazing']) as code
on conflict do nothing;

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

  select primary_image_url into source_url from artworks where id=workspace.artwork_id;
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

      select specification into spec from provider_catalog_variants
        where provider_code=candidate.provider_code and external_id=candidate.external_id and external_variant_id=candidate.external_variant_id;
      variant_id:=gen_random_uuid();
      insert into product_variants(id,product_id,sku,title,fulfillment_type,inventory_policy,allowed_countries)
      values(variant_id,product_id,'WALL-'||upper(variant_id::text),left(coalesce(v->>'title',spec->>'title'),240),'provider','made_to_order',
        array(select distinct b.country from jsonb_array_elements(v->'prices') entry
          join price_books b on b.id=(entry->>'bookId')::uuid where b.country is not null));
      insert into provider_product_mappings(product_variant_id,provider_code,external_id,external_variant_id,external_configuration,production_asset_id)
      values(variant_id,candidate.provider_code,candidate.external_id,candidate.external_variant_id,coalesce(v->'configuration','{}'),
        (select id from art_assets where id=workspace.source_asset_id and artwork_id=workspace.artwork_id
          and visibility='private' and asset_type='production_derivative' and processing_status='ready'));
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
revoke all on function public.save_wall_art_studio(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_wall_art_studio(uuid,uuid,jsonb) to service_role;
commit;
