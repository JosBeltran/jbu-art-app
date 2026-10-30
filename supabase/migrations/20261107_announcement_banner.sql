-- Announcement Banner configurable desde Admin > Home.
-- Aditiva: extiende la fila única de site_settings (20261103), que ya tiene
-- lectura pública y escritura solo Admin vía is_jbu_admin(). No borra nada.

alter table public.site_settings
  add column if not exists announcement_enabled boolean not null default false,
  add column if not exists announcement_text_es text not null default 'Envío nacional e internacional incluido',
  add column if not exists announcement_text_en text not null default 'National and international shipping included';
