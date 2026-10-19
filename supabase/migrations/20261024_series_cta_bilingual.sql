-- Texto del botón de Series en inglés. Segura de repetir.
-- cta_label sigue siendo el texto en español; cta_label_en vacío usa el español.
alter table public.series add column if not exists cta_label_en text;
