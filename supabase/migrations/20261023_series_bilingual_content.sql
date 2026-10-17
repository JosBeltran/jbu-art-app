-- Contenido público bilingüe de Series (ES/EN). Segura de repetir.
-- Solo agrega columnas de texto y copia el contenido existente (español) a *_es
-- donde aún esté vacío. No toca title, slug, estados, portada ni relaciones.
alter table public.series
  add column if not exists name_es text,
  add column if not exists name_en text,
  add column if not exists subtitle_es text,
  add column if not exists subtitle_en text,
  add column if not exists short_description_es text,
  add column if not exists short_description_en text,
  add column if not exists description_es text,
  add column if not exists description_en text;

-- Copia legado → español sin sobrescribir. Inglés queda vacío (sin traducciones inventadas).
update public.series set name_es = coalesce(nullif(trim(home_headline), ''), title)
 where nullif(trim(coalesce(name_es, '')), '') is null and (nullif(trim(coalesce(home_headline, '')), '') is not null or nullif(trim(coalesce(title, '')), '') is not null);
update public.series set subtitle_es = home_subtitle
 where nullif(trim(coalesce(subtitle_es, '')), '') is null and nullif(trim(coalesce(home_subtitle, '')), '') is not null;
update public.series set short_description_es = home_description
 where nullif(trim(coalesce(short_description_es, '')), '') is null and nullif(trim(coalesce(home_description, '')), '') is not null;
update public.series set description_es = description
 where nullif(trim(coalesce(description_es, '')), '') is null and nullif(trim(coalesce(description, '')), '') is not null;

-- Reporte: qué quedó migrado
select title, name_es, name_en, subtitle_es is not null as has_subtitle_es,
       short_description_es is not null as has_short_es, description_es is not null as has_description_es
  from public.series order by home_order, title;
