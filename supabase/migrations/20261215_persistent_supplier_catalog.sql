-- Supplier index only. JBU products, price books, mappings and order snapshots are not synchronized.
create table supplier_catalog_state (
  provider_code text primary key references fulfillment_providers(code),
  active_revision uuid, last_success_at timestamptz,
  schedule_enabled boolean not null default false,
  interval_hours integer not null default 24 check(interval_hours between 1 and 720),
  next_refresh_at timestamptz
);
insert into supplier_catalog_state(provider_code) values('gelato'),('prodigi');
create table supplier_catalog_runs (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null references supplier_catalog_state(provider_code),
  status text not null default 'queued' check(status in ('queued','running','retry','failed','complete')),
  checkpoint jsonb not null default '{}', lease_token uuid, lease_until timestamptz,
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  pages integer not null default 0, errors integer not null default 0, last_error text,
  stats jsonb not null default '{}', created_at timestamptz not null default now(), completed_at timestamptz
);
create unique index supplier_catalog_one_run on supplier_catalog_runs(provider_code) where status in ('queued','running','retry');
alter table supplier_catalog_state add foreign key(active_revision) references supplier_catalog_runs(id);
create table supplier_catalog_entries (
  revision uuid not null references supplier_catalog_runs(id), provider_code text not null,
  external_id text not null, external_variant_id text not null,
  group_key text not null, family text not null, product jsonb not null, variant jsonb not null,
  metadata jsonb not null, fingerprint text not null,
  primary key(revision,external_id,external_variant_id)
);
create index supplier_catalog_entry_group on supplier_catalog_entries(revision,group_key,external_id,external_variant_id);
create table supplier_catalog_groups (
  revision uuid not null references supplier_catalog_runs(id), group_key text not null,
  provider_code text not null, family text not null, metadata jsonb not null,
  search_text text not null,
  search_document tsvector generated always as (to_tsvector('simple',translate(lower(search_text),'áéíóúüñ','aeiouun'))) stored,
  variant_count integer not null,
  primary key(revision,group_key)
);
create index supplier_catalog_group_search on supplier_catalog_groups using gin(search_document);
create index supplier_catalog_group_page on supplier_catalog_groups(revision,provider_code,family,group_key);
-- Approval is exact-URL scoped, recorded only after a human verifies the supplier licence.
create table supplier_catalog_image_permissions (
  provider_code text not null references fulfillment_providers(code), image_url text not null,
  permission_reference text not null check(length(permission_reference)>0),
  verified_by uuid not null, verified_at timestamptz not null default now(), enabled boolean not null default true,
  primary key(provider_code,image_url), check(image_url ~ '^https://')
);
alter table provider_catalog_products add column catalog_status text not null default 'stale' check(catalog_status in ('active','unavailable','stale'));
alter table provider_catalog_products add column catalog_revision uuid references supplier_catalog_runs(id);
alter table provider_catalog_variants add column catalog_status text not null default 'stale' check(catalog_status in ('active','unavailable','stale'));
alter table provider_catalog_variants add column catalog_revision uuid references supplier_catalog_runs(id);
alter table product_discovery_candidates add column catalog_snapshot jsonb;
-- Pin pre-existing sessions before refreshing their referenced provider rows.
update product_discovery_candidates c set catalog_snapshot=jsonb_build_object('variant',v.specification)
from provider_catalog_variants v where v.provider_code=c.provider_code and v.external_id=c.external_id and v.external_variant_id=c.external_variant_id;

create function start_supplier_catalog_sync(_provider text, _retry boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare r supplier_catalog_runs; begin
  perform 1 from supplier_catalog_state where provider_code=_provider for update;
  if not found then raise exception 'unknown_provider'; end if;
  select * into r from supplier_catalog_runs where provider_code=_provider and status in ('queued','running','retry');
  if found then return r.id; end if;
  if _retry then
    select * into r from supplier_catalog_runs where provider_code=_provider and status='failed' order by created_at desc limit 1;
    if found then
      update supplier_catalog_runs set status='queued',attempts=0,next_attempt_at=now(),lease_token=null,lease_until=null,completed_at=null where id=r.id;
      return r.id;
    end if;
  end if;
  update supplier_catalog_state set next_refresh_at=case when schedule_enabled then now()+make_interval(hours=>interval_hours) end where provider_code=_provider;
  insert into supplier_catalog_runs(provider_code) values(_provider) returning id into r.id;
  return r.id;
end $$;

create function claim_supplier_catalog_batch(_provider text, _token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r supplier_catalog_runs; begin
  select * into r from supplier_catalog_runs where provider_code=_provider
    and status in ('queued','running','retry') and next_attempt_at<=now()
    and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update supplier_catalog_runs set status='running',lease_token=_token,lease_until=now()+interval '90 seconds' where id=r.id;
  return to_jsonb(r);
end $$;

-- Atomic page commit and checkpoint; a timed-out worker cannot publish after its replacement.
create function commit_supplier_catalog_batch(_run uuid,_token uuid,_checkpoint jsonb,_entries jsonb,_complete boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r supplier_catalog_runs; e jsonb; previous uuid; added integer; changed integer; removed integer; n integer; g integer; begin
  select * into r from supplier_catalog_runs where id=_run and status='running' and lease_token=_token and lease_until>now() for update;
  if not found then raise exception 'supplier_catalog_lease_lost'; end if;
  for e in select value from jsonb_array_elements(_entries) loop
    insert into supplier_catalog_entries(revision,provider_code,external_id,external_variant_id,group_key,family,product,variant,metadata,fingerprint)
    values(r.id,r.provider_code,e->>'externalId',e->>'externalVariantId',e->>'groupKey',e->>'family',e->'product',e->'variant',e->'metadata',e->>'fingerprint')
    on conflict(revision,external_id,external_variant_id) do update set group_key=excluded.group_key,family=excluded.family,
      product=excluded.product,variant=excluded.variant,metadata=excluded.metadata,fingerprint=excluded.fingerprint;
  end loop;
  if _complete then
    select active_revision into previous from supplier_catalog_state where provider_code=r.provider_code for update;
    select count(*) into n from supplier_catalog_entries where revision=r.id;
    -- Empty responses must never erase a last-known-good catalogue automatically.
    if n=0 then raise exception 'supplier_catalog_empty'; end if;
    select count(*) filter(where old.external_id is null),count(*) filter(where old.external_id is not null and old.fingerprint<>fresh.fingerprint)
      into added,changed from supplier_catalog_entries fresh left join supplier_catalog_entries old
      on old.revision=previous and old.external_id=fresh.external_id and old.external_variant_id=fresh.external_variant_id where fresh.revision=r.id;
    select count(*) into removed from supplier_catalog_entries old where old.revision=previous and not exists
      (select 1 from supplier_catalog_entries fresh where fresh.revision=r.id and fresh.external_id=old.external_id and fresh.external_variant_id=old.external_variant_id);
    insert into supplier_catalog_groups(revision,group_key,provider_code,family,metadata,search_text,variant_count)
    select r.id,group_key,r.provider_code,min(family),(jsonb_agg(metadata order by external_id,external_variant_id)->0) || jsonb_build_object(
        'sizes',coalesce(jsonb_agg(distinct variant->'attributes'->>'size') filter(where variant->'attributes'->>'size' is not null),'[]'),
        'finishes',coalesce(jsonb_agg(distinct variant->'attributes'->>'finish') filter(where variant->'attributes'->>'finish' is not null),'[]'),
        'frames',coalesce(jsonb_agg(distinct variant->'attributes'->>'frame_color') filter(where variant->'attributes'->>'frame_color' is not null),'[]'),
        'specifications',(jsonb_agg(metadata->'specifications' order by external_id,external_variant_id)->0)-'finish'),
      string_agg(distinct (metadata::text||' '||coalesce(variant->'attributes','{}')::text),' '),count(*)
      from supplier_catalog_entries where revision=r.id group by group_key;
    get diagnostics g=row_count;
    update provider_catalog_products set catalog_status='unavailable' where provider_code=r.provider_code and catalog_revision is not null;
    update provider_catalog_variants set catalog_status='unavailable' where provider_code=r.provider_code and catalog_revision is not null;
    insert into provider_catalog_products(provider_code,external_id,title,category,specification,synced_at,catalog_status,catalog_revision)
    select distinct on(external_id) r.provider_code,external_id,product->>'title',product->>'category',product,now(),'active',r.id
      from supplier_catalog_entries where revision=r.id order by external_id,external_variant_id
    on conflict(provider_code,external_id) do update set title=excluded.title,category=excluded.category,specification=excluded.specification,
      synced_at=excluded.synced_at,catalog_status='active',catalog_revision=r.id;
    insert into provider_catalog_variants(provider_code,external_id,external_variant_id,external_sku,specification,catalog_status,catalog_revision)
    select r.provider_code,external_id,external_variant_id,variant->>'sku',variant,'active',r.id from supplier_catalog_entries where revision=r.id
    on conflict(provider_code,external_id,external_variant_id) do update set external_sku=excluded.external_sku,specification=excluded.specification,catalog_status='active',catalog_revision=r.id;
    update supplier_catalog_state set active_revision=r.id,last_success_at=now(),
      next_refresh_at=case when schedule_enabled then now()+make_interval(hours=>interval_hours) end where provider_code=r.provider_code;
    update supplier_catalog_runs set status='complete',completed_at=now(),stats=jsonb_build_object('groups',g,'variants',n,'added',added,'updated',changed,'removed',removed) where id=r.id;
  end if;
  update supplier_catalog_runs set checkpoint=_checkpoint,pages=pages+1,attempts=0,lease_token=null,lease_until=null,
    status=case when _complete then 'complete' else 'queued' end,next_attempt_at=now() where id=r.id;
  return jsonb_build_object('complete',_complete,'revision',r.id);
end $$;

create function fail_supplier_catalog_batch(_run uuid,_token uuid,_error text,_delay integer,_terminal boolean) returns void
language plpgsql security definer set search_path=public as $$ begin
  update supplier_catalog_runs set status=case when _terminal or attempts>=4 then 'failed' else 'retry' end,
    attempts=attempts+1,errors=errors+1,last_error=left(_error,160),
    completed_at=case when _terminal or attempts>=4 then now() else null end,next_attempt_at=now()+make_interval(secs=>greatest(1,least(_delay,86400))),
    lease_token=null,lease_until=null where id=_run and status='running' and lease_token=_token and lease_until>now();
end $$;

create function browse_supplier_catalog(_provider text default 'all',_family text default '',_query text default '',_country text default '',_offset integer default 0,_limit integer default 12,_sort text default 'title') returns jsonb
language sql stable security definer set search_path=public as $$
with filtered as (
  select g.* from supplier_catalog_groups g join supplier_catalog_state s on s.active_revision=g.revision and s.provider_code=g.provider_code
  where (_provider='all' or g.provider_code=_provider) and (_family='' or g.family=_family)
    and (_query='' or g.search_document @@ plainto_tsquery('simple',translate(lower(left(_query,160)),'áéíóúüñ','aeiouun')))
    and exists(select 1 from supplier_catalog_entries e where e.revision=g.revision and e.group_key=g.group_key
      and (_country='' or coalesce(jsonb_array_length(e.variant->'countries'),0)=0 or e.variant->'countries' ? _country))
), page as (select * from filtered order by case when _sort='supplier' then provider_code else metadata->'titles'->>0 end,group_key
  offset greatest(0,_offset) limit least(48,greatest(1,_limit)))
select jsonb_build_object('total',(select count(*) from filtered),'groups',coalesce((select jsonb_agg((to_jsonb(page)-'search_text'-'search_document') || jsonb_build_object('metadata',page.metadata ||
  jsonb_build_object('image',(select to_jsonb(permission)-'verified_by'-'enabled' from supplier_catalog_image_permissions permission
    where permission.provider_code=page.provider_code and permission.enabled and exists(
      select 1 from jsonb_array_elements(coalesce(page.metadata->'images','[]')) image where image->>'url'=permission.image_url)
    order by permission.image_url limit 1)))) from page),'[]'::jsonb));
$$;

-- Only the authenticated admin API and CRON_SECRET worker receive a service client.
do $$ declare t text; f regprocedure; begin
  foreach t in array array['supplier_catalog_state','supplier_catalog_runs','supplier_catalog_entries','supplier_catalog_groups','supplier_catalog_image_permissions'] loop
    execute format('alter table %I enable row level security',t);
    execute format('revoke all on %I from public,anon,authenticated',t);
    execute format('grant select,insert,update on %I to service_role',t);
  end loop;
  for f in select oid::regprocedure from pg_proc where proname in ('start_supplier_catalog_sync','claim_supplier_catalog_batch','commit_supplier_catalog_batch','fail_supplier_catalog_batch','browse_supplier_catalog') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

-- Pin selected production dimensions across supplier revisions.
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

      select coalesce(candidate.catalog_snapshot->'variant',specification) into spec from provider_catalog_variants
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
