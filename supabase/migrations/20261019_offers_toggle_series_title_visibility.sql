-- 20261019: (1) cada obra decide si recibe ofertas; (2) la visibilidad por Serie también aplica
-- a obras ligadas por nombre de serie (columna de texto artworks.series) y no solo por series_id.
-- Requiere 20261018. Idempotente.

alter table public.artworks add column if not exists accepts_offers boolean not null default true;

create or replace view public.artworks_discoverable with (security_invoker = true) as
select a.*
  from public.artworks a
 where not exists (
   select 1 from public.series s
    where (s.id = a.series_id
           or (a.series_id is null and a.series is not null and upper(trim(a.series)) = upper(trim(s.title))))
      and not public.series_allows_discovery(s.editorial_status, s.auto_launch, s.launch_date)
 );
grant select on public.artworks_discoverable to anon, authenticated;
