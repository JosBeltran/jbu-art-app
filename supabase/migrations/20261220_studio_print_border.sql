begin;

alter table public.wall_art_mockups add column border_mm integer not null default 0
  check (border_mm in (0,5,10,15,20,30) and
    (border_mm=0 or (width_mm is not null and height_mm is not null and least(width_mm,height_mm)>2*border_mm)));

create or replace function public.link_studio_print_master(_variant uuid)
returns void language plpgsql set search_path=public as $$
declare master print_asset_generations; asset uuid; artwork uuid; mockup wall_art_mockups; target product_variants;
begin
  select * into target from product_variants where id=_variant for update;
  if not found or target.status in ('active','archived') then return; end if;
  select w.* into mockup from wall_art_mockups w where w.variant_id=_variant;
  if mockup.width_mm is null or mockup.height_mm is null then return; end if;
  if exists (select 1 from provider_product_mappings m where m.product_variant_id=_variant and m.enabled) then return; end if;
  select rel.artwork_id into artwork from artwork_products rel
  join product_discovery_selections chosen on chosen.product_variant_id=_variant
  join product_discovery_candidates candidate on candidate.id=chosen.candidate_id
  join product_discovery_sessions session on session.id=candidate.session_id and session.artwork_id=rel.artwork_id
  where rel.product_id=target.product_id and rel.is_primary;
  if artwork is null then return; end if;

  select g.* into master from print_asset_generations g
  join artwork_prints p on p.id=g.print_id and p.artwork_id=g.artwork_id and upper(trim(p.size))=g.size
  where g.artwork_id=artwork and g.is_current and g.production_status='MASTER_READY'
    and nullif(trim(g.production_file_path),'') is not null
    and abs((g.layout->>'paperWidthMm')::numeric-mockup.width_mm)<=1
    and abs((g.layout->>'paperHeightMm')::numeric-mockup.height_mm)<=1
    and (mockup.border_mm=0 or (mockup.fit='contain' and
      (select min((g.layout->'marginsMm'->>edge)::numeric)
        from unnest(array['top','right','bottom','left']) edge
        having count(g.layout->'marginsMm'->>edge)=4) between mockup.border_mm-0.15 and mockup.border_mm+0.15))
  order by g.effective_dpi desc,g.generated_at desc,g.revision_id
  limit 1;
  if not found then return; end if;

  insert into art_assets(artwork_id,storage_bucket,storage_path,asset_type,visibility,width_px,height_px,dpi)
  values(artwork,'print-masters',master.production_file_path,'production_derivative','private',
    (master.layout->>'width')::int,(master.layout->>'height')::int,master.effective_dpi)
  on conflict (storage_bucket,storage_path,version) do nothing;
  select id into asset from art_assets where artwork_id=artwork and storage_bucket='print-masters'
    and storage_path=master.production_file_path and asset_type='production_derivative'
    and visibility='private' and processing_status='ready' order by version desc limit 1;
  if asset is null then return; end if;

  insert into product_variant_assets(variant_id,asset_id,role) values(_variant,asset,'production') on conflict do nothing;
  update provider_product_mappings set production_asset_id=asset
  where product_variant_id=_variant and not enabled and production_asset_id is distinct from asset;
end $$;

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
          and visibility='private' and asset_type='production_derivative' and processing_status='ready'
          and coalesce((v->>'borderMm')::integer,0)=0));
      -- Preserve the selected ready private asset without certifying supplier mapping.
      insert into product_variant_assets(variant_id,asset_id,role)
      select variant_id,a.id,'production' from art_assets a
      where a.id=workspace.source_asset_id and a.artwork_id=workspace.artwork_id
        and a.visibility='private' and a.asset_type='production_derivative' and a.processing_status='ready'
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

commit;
