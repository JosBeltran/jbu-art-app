-- Public lists inherit the existing effective Series status. No artwork/ownership fields change.
create or replace function public.series_allows_discovery(_status text, _auto_launch boolean, _launch_date timestamptz)
returns boolean language sql stable as $$
  select coalesce(_status, 'active') = 'active'
    or (coalesce(_status, 'active') = 'coming_soon'
      and coalesce(_auto_launch, false) and _launch_date is not null and _launch_date <= now())
$$;
grant execute on function public.series_allows_discovery(text, boolean, timestamptz) to anon, authenticated;

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