begin;

create table public.wall_art_studio_saves (
  session_id uuid primary key references public.product_discovery_sessions,
  product_ids uuid[] not null,
  created_at timestamptz not null default now()
);
create table public.wall_art_mockups (
  variant_id uuid primary key references public.product_variants on delete cascade,
  source_url text not null,
  scenes text[] not null check (cardinality(scenes) between 1 and 2 and scenes <@ array['gallery','wall']),
  primary_scene text not null check (primary_scene=any(scenes)),
  fit text not null check (fit in ('contain','cover')),
  width_mm numeric check (width_mm > 0),
  height_mm numeric check (height_mm > 0)
);
alter table public.wall_art_studio_saves enable row level security;
alter table public.wall_art_mockups enable row level security;
revoke all on public.wall_art_studio_saves,public.wall_art_mockups from public,anon,authenticated;
grant select,insert on public.wall_art_studio_saves,public.wall_art_mockups to service_role;

create function public.save_wall_art_studio(_actor uuid,_session uuid,_products jsonb)
returns uuid[] language plpgsql set search_path=public as $$
declare workspace product_discovery_sessions; saved uuid[]; p jsonb; v jsonb; price jsonb;
  candidate product_discovery_candidates; spec jsonb; product_id uuid; variant_id uuid; book price_books; source_url text;
begin
  select * into workspace from product_discovery_sessions where id=_session for update;
  if _actor is null or not found or workspace.created_by<>_actor or workspace.artwork_id is null
    or workspace.state='archived' or workspace.criteria->>'workflow' is distinct from 'wall_art' then
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
        where c.id=(v->>'candidateId')::uuid and c.session_id=_session and c.provider_code='gelato'
          and c.compatibility->>'status' is distinct from 'incompatible';
      if not found then raise exception 'wall_art_candidate_invalid'; end if;

      select specification into spec from provider_catalog_variants
        where provider_code='gelato' and external_id=candidate.external_id and external_variant_id=candidate.external_variant_id;
      variant_id:=gen_random_uuid();
      insert into product_variants(id,product_id,sku,title,fulfillment_type,inventory_policy,allowed_countries)
      values(variant_id,product_id,'WALL-'||upper(variant_id::text),left(spec->>'title',240),'provider','made_to_order',
        array(select distinct b.country from jsonb_array_elements(v->'prices') entry
          join price_books b on b.id=(entry->>'bookId')::uuid where b.country is not null));
      insert into provider_product_mappings(product_variant_id,provider_code,external_id,external_variant_id,production_asset_id)
      values(variant_id,'gelato',candidate.external_id,candidate.external_variant_id,
        (select id from art_assets where id=workspace.source_asset_id and artwork_id=workspace.artwork_id
          and visibility='private' and asset_type='production_derivative' and processing_status='ready'));
      insert into product_discovery_selections(candidate_id,product_variant_id,approved_by)
      values(candidate.id,variant_id,_actor);
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
