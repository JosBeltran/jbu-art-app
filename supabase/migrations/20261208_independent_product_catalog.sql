begin;

create table public.product_families (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
  label_es text not null, label_en text not null
);
insert into public.product_families values
  ('original','Obra original','Original artwork'), ('fine_art_print','Impresión Fine Art','Fine Art print'),
  ('framed_print','Impresión enmarcada','Framed print'), ('canvas','Lienzo','Canvas'),
  ('acrylic','Panel acrílico','Acrylic panel'), ('physical_edition','Edición física','Physical edition'),
  ('digital','Descarga digital','Digital download'), ('merchandise','Otros productos','Merchandise');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null check (length(trim(sku)) between 1 and 100),
  family_code text not null references public.product_families,
  title_es text not null check (length(trim(title_es)) between 1 and 240),
  title_en text, description_es text, description_en text,
  status text not null default 'draft' check (status in ('draft','configuring','pending_review','ready','published','archived')),
  legacy_artwork_id uuid references public.artworks(id) on delete set null,
  legacy_source text check (legacy_source in ('artwork','prints')),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (legacy_artwork_id,legacy_source)
);
create unique index products_sku_ci on public.products (lower(trim(sku)));
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products on delete cascade,
  sku text not null check (length(trim(sku)) between 1 and 100),
  title text,
  status text not null default 'draft' check (status in ('draft','ready','active','archived')),
  fulfillment_type text not null check (fulfillment_type in ('manual','provider','digital')),
  inventory_policy text not null check (inventory_policy in ('legacy','finite','made_to_order','unlimited')),
  allowed_countries text[] check (public.valid_shipping_countries(allowed_countries)),
  legacy_print_id uuid unique references public.artwork_prints(id) on delete set null,
  legacy_artwork_id uuid references public.artworks(id) on delete set null,
  legacy_source text check (legacy_source in ('artwork','legacy_print')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (legacy_artwork_id,legacy_source)
);
create unique index product_variants_sku_ci on public.product_variants (lower(trim(sku)));
create index product_variants_product_id on public.product_variants (product_id);
create table public.artwork_products (
  artwork_id uuid references public.artworks(id) on delete cascade,
  product_id uuid references public.products on delete cascade,
  relationship_type text not null check (relationship_type in ('original','derived','featured')),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (artwork_id,product_id,relationship_type)
);
create unique index artwork_products_primary on public.artwork_products (product_id) where is_primary;

create table public.product_attributes (
  code text primary key, label_es text not null, label_en text not null,
  value_type text not null check (value_type in ('string','number','boolean','enum','measurement')),
  measurement_unit text,
  check ((value_type = 'measurement') = (measurement_unit is not null))
);
insert into public.product_attributes values
 ('size','Tamaño','Size','string',null),('material','Material','Material','string',null),
 ('finish','Acabado','Finish','string',null),('frame','Marco','Frame','string',null),
 ('orientation','Orientación','Orientation','enum',null),('edition','Edición','Edition','enum',null),
 ('width','Ancho','Width','measurement','mm'),('height','Alto','Height','measurement','mm'),
 ('paper_weight','Gramaje','Paper weight','measurement','gsm');
create table public.product_attribute_values (
  attribute_code text references public.product_attributes,
  code text not null, label_es text not null, label_en text not null,
  primary key (attribute_code,code)
);
insert into public.product_attribute_values values
 ('orientation','portrait','Vertical','Portrait'),('orientation','landscape','Horizontal','Landscape'),
 ('orientation','square','Cuadrado','Square'),('edition','open','Abierta','Open'),
 ('edition','limited','Limitada','Limited'),('edition','unique','Única','Unique');
create table public.product_family_attributes (
  family_code text references public.product_families, attribute_code text references public.product_attributes,
  required boolean not null default false, display_order integer not null default 0,
  primary key (family_code,attribute_code)
);
insert into public.product_family_attributes (family_code,attribute_code,display_order)
select f.code, a.code, a.ordinality from public.product_families f
cross join unnest(array['size','material','finish','frame','orientation','edition','width','height','paper_weight'])
  with ordinality a(code, ordinality) where f.code in ('fine_art_print','framed_print','canvas','acrylic','merchandise');
create table public.product_variant_attribute_values (
  variant_id uuid references public.product_variants on delete cascade,
  attribute_code text references public.product_attributes,
  text_value text, number_value numeric, boolean_value boolean, enum_value text,
  primary key (variant_id,attribute_code),
  foreign key (attribute_code,enum_value) references public.product_attribute_values,
  check (num_nonnulls(text_value,number_value,boolean_value,enum_value) = 1)
);

create table public.art_assets (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid references public.artworks(id) on delete set null,
  asset_type text not null check (asset_type in ('original_photo','private_master','production_derivative','mockup','lifestyle','thumbnail')),
  visibility text not null check (visibility in ('private','public')),
  public_url text, storage_bucket text, storage_path text, version integer not null default 1 check (version > 0),
  width_px integer check (width_px > 0), height_px integer check (height_px > 0),
  dpi numeric check (dpi > 0), format text, color_profile text, byte_size bigint check (byte_size > 0),
  processing_status text not null default 'ready' check (processing_status in ('pending','ready','failed')),
  created_at timestamptz not null default now(),
  check (visibility <> 'public' or asset_type not in ('private_master','production_derivative')),
  check (visibility <> 'private' or (public_url is null and storage_path is not null and storage_bucket is not null)),
  unique (storage_bucket,storage_path,version),
  unique (artwork_id,public_url,asset_type)
);
create table public.product_media (
  product_id uuid references public.products on delete cascade,
  asset_id uuid references public.art_assets,
  display_order integer not null default 0, is_primary boolean not null default false,
  primary key (product_id,asset_id)
);
create unique index product_media_primary on public.product_media (product_id) where is_primary;
create table public.product_variant_assets (
  variant_id uuid references public.product_variants on delete cascade,
  asset_id uuid references public.art_assets,
  role text not null check (role in ('gallery','production')),
  display_order integer not null default 0, is_primary boolean not null default false,
  primary key (variant_id,asset_id,role)
);
create unique index product_variant_assets_primary on public.product_variant_assets (variant_id,role) where is_primary;

create table public.price_books (
  id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  country text check (public.valid_shipping_countries(array[country]) or country is null),
  channel text not null default 'storefront', segment text,
  status text not null default 'draft' check (status in ('draft','active','archived','reference')),
  priority integer not null default 0, valid_from timestamptz, valid_to timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_from < valid_to)
);
insert into public.price_books (code,name,country,currency,status) values
 ('legacy-mxn','Legacy checkout reference',null,'MXN','reference'),
 ('mx-mxn','México','MX','MXN','draft'), ('us-usd','United States','US','USD','draft'),
 ('ca-cad','Canada','CA','CAD','draft'), ('gb-gbp','United Kingdom','GB','GBP','draft'),
 ('se-sek','Sweden','SE','SEK','draft');
create table public.price_book_entries (
  id uuid primary key default gen_random_uuid(), price_book_id uuid not null references public.price_books,
  product_variant_id uuid not null references public.product_variants,
  amount_minor bigint not null check (amount_minor between 1 and 999999999999),
  compare_at_minor bigint check (compare_at_minor >= amount_minor),
  status text not null default 'draft' check (status in ('draft','active','archived','reference')),
  valid_from timestamptz, valid_to timestamptz, approved_by uuid, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (valid_from is null or valid_to is null or valid_from < valid_to),
  check (status <> 'active' or (approved_by is not null and approved_at is not null))
);
create unique index price_entry_legacy_reference on public.price_book_entries (price_book_id,product_variant_id) where status='reference';
create index price_book_entries_variant on public.price_book_entries (product_variant_id,status);

create table public.product_catalog_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null,
  operation text not null, subject_id uuid not null, created_at timestamptz not null default now()
);

do $$
declare rel text;
begin
  foreach rel in array array['product_families','products','product_variants','artwork_products','product_attributes',
    'product_attribute_values','product_family_attributes','product_variant_attribute_values','art_assets',
    'product_media','product_variant_assets','price_books','price_book_entries','product_catalog_audit']
  loop
    execute format('alter table public.%I enable row level security', rel);
    execute format('revoke all on public.%I from public, anon, authenticated', rel);
    execute format('grant select, insert, update on public.%I to service_role', rel);
  end loop;
end $$;
commit;
