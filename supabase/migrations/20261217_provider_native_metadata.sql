-- Optional metadata acceleration, never a manufacturing SKU inventory or commerce authority.
create table public.provider_metadata_cache (
  provider_code text not null references public.fulfillment_providers(code),
  cache_key text not null check(length(cache_key)<=500),
  schema_version integer not null default 1,
  value jsonb not null check(octet_length(value::text)<=2000000),
  fingerprint text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(provider_code,cache_key)
);
alter table public.provider_metadata_cache enable row level security;
revoke all on public.provider_metadata_cache from public,anon,authenticated;
grant select,insert,update on public.provider_metadata_cache to service_role;
-- No supplier runs/checkpoints, indexed rows, mappings, price books or publication flags are changed.
