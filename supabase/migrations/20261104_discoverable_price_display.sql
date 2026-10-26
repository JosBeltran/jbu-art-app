-- La vista pública del catálogo se creó con a.* antes de que existiera
-- artworks.price_display_mode (20261103). Postgres congela las columnas de una
-- vista al crearla, por eso el catálogo no veía «Consultar precio».
-- Se recrea con la misma definición (20261026); solo añade la columna nueva al final.
create or replace view public.artworks_discoverable with (security_invoker = true) as
select a.* from public.artworks a
where a.status::text in ('AVAILABLE', 'OWNED')
  and (a.series_id is null or exists (select 1 from public.series s where s.id = a.series_id))
  and not exists (
    select 1 from public.series s
    where (s.id = a.series_id
      or (a.series_id is null and a.series is not null and upper(trim(a.series)) = upper(trim(s.title))))
      and not public.series_allows_discovery(s.editorial_status, s.auto_launch, s.launch_date)
  );
grant select on public.artworks_discoverable to anon, authenticated;
