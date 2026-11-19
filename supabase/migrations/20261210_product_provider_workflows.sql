begin;
create table public.fulfillment_providers (
  code text primary key, label text not null, enabled boolean not null default true
);
insert into public.fulfillment_providers values ('gelato','Gelato',true),('prodigi','Prodigi',true);

create table public.provider_catalog_products (
  provider_code text references public.fulfillment_providers,
  external_id text not null, external_sku text, category text, title text not null,
  specification jsonb not null default '{}', synced_at timestamptz not null default now(),
  primary key (provider_code,external_id)
);
create table public.provider_catalog_variants (
  provider_code text not null, external_id text not null, external_variant_id text not null,
  external_sku text not null, specification jsonb not null default '{}',
  primary key (provider_code,external_id,external_variant_id),
  foreign key (provider_code,external_id) references public.provider_catalog_products on delete cascade
);
create table public.provider_product_mappings (
  id uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants on delete cascade,
  provider_code text not null, external_id text not null, external_variant_id text not null,
  external_configuration jsonb not null default '{}',
  production_asset_id uuid references public.art_assets,
  allowed_countries text[] check(public.valid_shipping_countries(allowed_countries)),
  priority integer not null default 0, enabled boolean not null default false,
  validation_status text not null default 'unverified' check(validation_status in ('unverified','validated','rejected')),
  foreign key(provider_code,external_id,external_variant_id) references public.provider_catalog_variants,
  unique (product_variant_id,provider_code,external_id,external_variant_id),
  check(not enabled or (production_asset_id is not null and validation_status='validated'))
);
create table public.product_discovery_sessions (
  id uuid primary key default gen_random_uuid(), artwork_id uuid references public.artworks on delete restrict,
  source_asset_id uuid references public.art_assets, criteria jsonb not null default '{}',
  state text not null default 'open' check(state in ('open','review','drafted','archived')),
  created_by uuid not null, created_at timestamptz not null default now()
);
create table public.product_discovery_candidates (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.product_discovery_sessions on delete cascade,
  provider_code text not null, external_id text not null, external_variant_id text not null,
  compatibility jsonb not null default '{"status":"requires_validation"}',
  created_at timestamptz not null default now(),
  foreign key(provider_code,external_id,external_variant_id) references public.provider_catalog_variants,
  unique (session_id,provider_code,external_id,external_variant_id)
);
create table public.product_discovery_selections (
  candidate_id uuid references public.product_discovery_candidates,
  configuration jsonb not null default '{}',
  product_variant_id uuid not null references public.product_variants,
  approved_by uuid not null, approved_at timestamptz not null default now(),
  primary key(candidate_id,configuration)
);
create table public.provider_quotes (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.product_discovery_candidates,
  country text not null check(public.valid_shipping_countries(array[country])), currency text not null check(currency ~ '^[A-Z]{3}$'),
  manufacturing_minor bigint not null check(manufacturing_minor>=0), shipping_minor bigint not null check(shipping_minor>=0),
  tax_minor bigint check(tax_minor>=0), quoted_at timestamptz not null default now(), expires_at timestamptz not null,
  options jsonb not null default '{}', created_by uuid not null, check(expires_at>quoted_at)
);

alter table public.price_book_entries
  add column provider_quote_id uuid references public.provider_quotes,
  add column proposal_assumptions jsonb;

-- Private production linkage cannot be replaced with a public mockup.
create function public.check_product_production_asset() returns trigger
language plpgsql set search_path=public as $$
declare asset uuid;
begin
  if tg_table_name='provider_product_mappings' then asset:=new.production_asset_id;
  elsif new.role='production' then asset:=new.asset_id;
  else
    if not exists(select 1 from art_assets where id=new.asset_id and visibility='public') then
      raise exception 'public_image_required'; end if;
    return new;
  end if;
  if asset is not null and not exists(select 1 from art_assets where id=asset and visibility='private'
      and asset_type='production_derivative' and processing_status='ready') then
    raise exception 'private_production_derivative_required';
  end if;
  return new;
end $$;
create trigger provider_mapping_asset before insert or update on public.provider_product_mappings
for each row execute function public.check_product_production_asset();
create trigger variant_asset_role before insert or update on public.product_variant_assets
for each row execute function public.check_product_production_asset();

create function public.create_catalog_product_draft(_actor uuid,_product jsonb,_variant jsonb,_artwork uuid default null,_candidate uuid default null,_quote uuid default null)
returns jsonb language plpgsql set search_path=public as $$
declare item products; variant product_variants; candidate product_discovery_candidates; source_artwork uuid; source_asset uuid; session_state text; selection jsonb:='{}'; quote_provider provider_quotes;
begin
  if _actor is null then raise exception 'actor_required'; end if;
  if _candidate is not null then
    select * into candidate from product_discovery_candidates where id=_candidate for update;
    if not found then raise exception 'candidate_missing'; end if;
    select artwork_id,source_asset_id,state into source_artwork,source_asset,session_state
      from product_discovery_sessions where id=candidate.session_id;
    if _artwork is distinct from source_artwork then raise exception 'candidate_artwork_mismatch'; end if;
    if session_state='archived' or candidate.compatibility->>'status'='incompatible' then raise exception 'incompatible_candidate'; end if;
    if _quote is not null then
      select * into quote_provider from provider_quotes where id=_quote and candidate_id=_candidate and expires_at>now() and not (options ? 'fulfillmentJobId');
      if not found then raise exception 'quote_expired_or_mismatched'; end if;
      selection:=coalesce(quote_provider.options->'attributes','{}');
    end if;
    select v.* into variant from product_discovery_selections s join product_variants v on v.id=s.product_variant_id where s.candidate_id=_candidate and s.configuration=selection;
    if found then return jsonb_build_object('product_id',variant.product_id,'variant_id',variant.id,'reused',true); end if;
  elsif _quote is not null then raise exception 'quote_expired_or_mismatched';
  end if;

  insert into products (sku,family_code,title_es,title_en,description_es,description_en,created_by)
  values (_product->>'sku',_product->>'family',_product->>'titleEs',_product->>'titleEn',
    _product->>'descriptionEs',_product->>'descriptionEn',_actor) returning * into item;
  insert into product_variants (product_id,sku,fulfillment_type,inventory_policy)
  values (item.id,_variant->>'sku',case when _candidate is not null then 'provider' else _variant->>'fulfillmentType' end,
    case when _candidate is not null then 'made_to_order' else _variant->>'inventoryPolicy' end) returning * into variant;
  if _artwork is not null then
    insert into artwork_products(artwork_id,product_id,relationship_type,is_primary)
    values (_artwork,item.id,case when item.family_code='original' then 'original' else 'derived' end,true);
  end if;
  if _candidate is not null then
    insert into provider_product_mappings(product_variant_id,provider_code,external_id,external_variant_id,external_configuration,production_asset_id)
    values(variant.id,candidate.provider_code,candidate.external_id,candidate.external_variant_id,selection,
      (select id from art_assets where id=source_asset and visibility='private' and asset_type='production_derivative' and processing_status='ready'));
    insert into product_discovery_selections(candidate_id,configuration,product_variant_id,approved_by)
    values(_candidate,selection,variant.id,_actor);
    update product_discovery_sessions set state='drafted' where id=candidate.session_id;
  end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'create_product_draft',item.id);
  return jsonb_build_object('product_id',item.id,'variant_id',variant.id,'reused',false);
end $$;

create function public.approve_catalog_price(_actor uuid,_entry uuid)
returns void language plpgsql set search_path=public as $$
declare entry price_book_entries; book price_books;
begin
  if _actor is null then raise exception 'actor_required'; end if;
  select * into entry from price_book_entries where id=_entry for update;
  if not found or entry.status<>'draft' then raise exception 'price_not_draft'; end if;
  select * into book from price_books where id=entry.price_book_id for update;
  if not found or book.status not in ('draft','active') then raise exception 'price_book_unavailable'; end if;
  if exists(select 1 from price_book_entries e where e.price_book_id=book.id
      and e.product_variant_id=entry.product_variant_id and e.status='active'
      and tstzrange(e.valid_from,e.valid_to,'[)') && tstzrange(entry.valid_from,entry.valid_to,'[)')) then
    raise exception 'overlapping_price_entry';
  end if;
  update price_book_entries set status='active',approved_by=_actor,approved_at=now(),updated_at=now() where id=_entry;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'approve_price',_entry);
end $$;

create function public.activate_catalog_price_book(_actor uuid,_book uuid)
returns void language plpgsql set search_path=public as $$
begin
  if _actor is null then raise exception 'actor_required'; end if;
  update price_books set status='active',updated_at=now() where id=_book and status='draft'
    and exists(select 1 from price_book_entries where price_book_id=_book and status='active');
  if not found then raise exception 'price_book_has_no_approved_entries'; end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'activate_price_book',_book);
end $$;

do $$
declare rel text;
begin
  foreach rel in array array['fulfillment_providers','provider_catalog_products','provider_catalog_variants','provider_product_mappings',
    'product_discovery_sessions','product_discovery_candidates','product_discovery_selections','provider_quotes']
  loop
    execute format('alter table public.%I enable row level security', rel);
    execute format('revoke all on public.%I from public, anon, authenticated', rel);
    execute format('grant select, insert, update on public.%I to service_role', rel);
  end loop;
end $$;
revoke all on function public.create_catalog_product_draft(uuid,jsonb,jsonb,uuid,uuid,uuid),
  public.approve_catalog_price(uuid,uuid), public.activate_catalog_price_book(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_catalog_product_draft(uuid,jsonb,jsonb,uuid,uuid,uuid),
  public.approve_catalog_price(uuid,uuid), public.activate_catalog_price_book(uuid,uuid) to service_role;
commit;
