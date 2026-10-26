-- Hero configurable de portada + modo de presentación de precio por obra + consultas de precio.
-- Aditiva: no borra ni modifica datos existentes. Mismo patrón de permisos que promo_assets.
-- No toca subastas, ofertas, Stripe, certificados, reclamaciones ni órdenes.

-- 1. Modo de presentación del precio por obra (extensible, sin booleanos incompatibles).
alter table public.artworks
  add column if not exists price_display_mode text not null default 'SHOW_PRICE';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.artworks'::regclass
      and conname = 'artworks_price_display_mode_check'
  ) then
    alter table public.artworks
      add constraint artworks_price_display_mode_check
      check (price_display_mode in ('SHOW_PRICE', 'CONTACT_FOR_PRICE'));
  end if;
end $$;

-- 2. Elementos personalizados del Hero (imágenes o videos).
create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('IMAGE', 'VIDEO')),
  url text not null,
  poster_url text,
  title_es text,
  title_en text,
  description_es text,
  description_en text,
  link_url text,
  cta_es text,
  cta_en text,
  position integer not null default 0,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Configuración del Hero (una sola fila).
create table if not exists public.hero_settings (
  id boolean primary key default true check (id),
  mode text not null default 'FEATURED' check (mode in ('FEATURED', 'IMAGES', 'VIDEOS')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);

insert into public.hero_settings (id, mode)
values (true, 'FEATURED')
on conflict (id) do nothing;

-- 4. Configuración general del sitio (una sola fila): canal de consulta de precio.
create table if not exists public.site_settings (
  id boolean primary key default true check (id),
  inquiry_channel text not null default 'WHATSAPP' check (inquiry_channel in ('WHATSAPP', 'EMAIL', 'INTERNAL')),
  whatsapp_number text not null default '528123518298',
  inquiry_email text not null default 'josue.beltran.u@gmail.com',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);

insert into public.site_settings (id)
values (true)
on conflict (id) do nothing;

-- 5. Consultas de precio (EMAIL / INTERNAL). WHATSAPP no deja registro: es un enlace directo.
create table if not exists public.artwork_inquiries (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  sku text,
  title text,
  artwork_url text,
  channel text not null check (channel in ('EMAIL', 'INTERNAL')),
  user_id uuid references auth.users(id),
  email text,
  name text,
  message text,
  locale text not null default 'es',
  created_at timestamptz not null default now()
);

-- Permisos: lectura pública solo de slides activos y de la configuración no sensible;
-- escritura exclusiva de Admin; service_role conserva acceso total.
revoke all on public.hero_slides from anon, authenticated;
grant select on public.hero_slides to anon, authenticated;
grant all on public.hero_slides to service_role;
alter table public.hero_slides enable row level security;

drop policy if exists "hero slides public read enabled" on public.hero_slides;
create policy "hero slides public read enabled" on public.hero_slides
  for select to anon, authenticated using (enabled);

drop policy if exists "hero slides admin all" on public.hero_slides;
create policy "hero slides admin all" on public.hero_slides
  for all to authenticated
  using (public.is_jbu_admin()) with check (public.is_jbu_admin());

revoke all on public.hero_settings from anon, authenticated;
grant select on public.hero_settings to anon, authenticated;
grant all on public.hero_settings to service_role;
alter table public.hero_settings enable row level security;

drop policy if exists "hero settings public read" on public.hero_settings;
create policy "hero settings public read" on public.hero_settings
  for select to anon, authenticated using (true);

drop policy if exists "hero settings admin all" on public.hero_settings;
create policy "hero settings admin all" on public.hero_settings
  for all to authenticated
  using (public.is_jbu_admin()) with check (public.is_jbu_admin());

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant all on public.site_settings to service_role;
alter table public.site_settings enable row level security;

drop policy if exists "site settings public read" on public.site_settings;
create policy "site settings public read" on public.site_settings
  for select to anon, authenticated using (true);

drop policy if exists "site settings admin all" on public.site_settings;
create policy "site settings admin all" on public.site_settings
  for all to authenticated
  using (public.is_jbu_admin()) with check (public.is_jbu_admin());

-- Las consultas de precio no se leen desde el navegador: solo las crea la ruta de
-- servidor (service role) y las lee el Admin.
revoke all on public.artwork_inquiries from anon, authenticated;
grant select on public.artwork_inquiries to authenticated;
grant all on public.artwork_inquiries to service_role;
alter table public.artwork_inquiries enable row level security;

drop policy if exists "artwork inquiries admin read" on public.artwork_inquiries;
create policy "artwork inquiries admin read" on public.artwork_inquiries
  for select to authenticated using (public.is_jbu_admin());
