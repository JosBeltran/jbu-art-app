-- Compartir y distribución de obras — Fase 1. Aditivo e idempotente.
-- 1) Analítica ligera de compartidos (escritura solo vía RPC validado).
-- 2) marketplace_listings: preparación para integraciones futuras; sin registros falsos.

-- ---------------------------------------------------------------------
-- 1. Eventos de compartir
-- ---------------------------------------------------------------------
create table if not exists public.artwork_share_events (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  channel text not null,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.artwork_share_events
    add constraint artwork_share_channel_chk
    check (channel in ('native','whatsapp','pinterest','facebook','copy_link','x'));
exception when duplicate_object then null; end $$;

create index if not exists artwork_share_events_artwork_idx
  on public.artwork_share_events (artwork_id, created_at);

-- Nadie lee ni escribe la tabla directamente; el RPC valida el canal.
revoke all on public.artwork_share_events from anon, authenticated;
grant all on public.artwork_share_events to service_role;
alter table public.artwork_share_events enable row level security;

create or replace function public.record_artwork_share(target_artwork_id uuid, share_channel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if share_channel not in ('native','whatsapp','pinterest','facebook','copy_link','x') then
    return;
  end if;
  insert into public.artwork_share_events (artwork_id, channel)
  values (target_artwork_id, share_channel);
end;
$$;

grant execute on function public.record_artwork_share(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Listados en marketplaces externos (preparación; ninguno conectado aún)
-- ---------------------------------------------------------------------
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  channel text not null,
  external_listing_id text,
  external_url text,
  status text not null default 'draft',
  currency text not null default 'MXN',
  price numeric,
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.marketplace_listings
    add constraint marketplace_channel_chk
    check (channel in ('pinterest','mercadolibre','etsy','ebay','saatchi','facebook'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.marketplace_listings
    add constraint marketplace_status_chk
    check (status in ('draft','active','paused','sold','ended','error'));
exception when duplicate_object then null; end $$;

-- Una obra original (cantidad 1) solo puede tener un listado por canal.
create unique index if not exists marketplace_listings_artwork_channel_key
  on public.marketplace_listings (artwork_id, channel);

-- Solo el servidor (service_role) gestiona listados; nada público.
revoke all on public.marketplace_listings from anon, authenticated;
grant all on public.marketplace_listings to service_role;
alter table public.marketplace_listings enable row level security;
