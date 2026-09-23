-- Campos en inglés para obras (opcionales; si están vacíos se muestra el español).
alter table public.artworks
  add column if not exists title_en text,
  add column if not exists description_en text,
  add column if not exists medium_en text,
  add column if not exists technique_en text;
