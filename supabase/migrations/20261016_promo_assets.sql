-- Recursos reutilizables del Estudio de promoción (intro de mazo, intro/outro JBU, fondos, presets de exterior).
-- Aditiva; solo admin. No toca subastas, lotes, eventos ni Stripe.
create table if not exists public.promo_assets (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('GAVEL_INTRO','JBU_INTRO','JBU_OUTRO','BACKGROUND_VIDEO','OUTDOOR_PRESET')),
  label text not null,
  url text,
  settings jsonb,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind = 'OUTDOOR_PRESET' or url is not null)
);

revoke all on public.promo_assets from anon, authenticated;
grant select, insert, update, delete on public.promo_assets to authenticated;
grant all on public.promo_assets to service_role;
alter table public.promo_assets enable row level security;

drop policy if exists "promo assets admin" on public.promo_assets;
create policy "promo assets admin" on public.promo_assets for all to authenticated
  using (public.is_jbu_admin()) with check (public.is_jbu_admin());
