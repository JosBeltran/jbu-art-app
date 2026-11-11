begin;

-- The invoker sees the same artworks and Series as the public artwork detail.
-- Walk only public links so a historical print always has a reachable current work.
create function public.public_print_artworks(_ids uuid[])
returns table (
  id uuid, sku text, title text, title_en text, primary_image_url text,
  status text, allows_prints boolean
)
language sql stable security invoker set search_path = public as $$
  with recursive eligible as (
    select a.id, a.sku, a.title, a.title_en, a.primary_image_url, a.status,
      a.allows_prints, a.is_historical_version, a.version_parent_id
    from public.artworks_discoverable a
    where a.id = any(_ids) and a.allows_prints is true and nullif(btrim(a.sku), '') is not null
      and (a.version_kind is distinct from 'SUCCESSOR' or a.version_published_at is not null)
  ), connected(start_id, id, parent_id, historical) as (
    select a.id, a.id, a.version_parent_id, a.is_historical_version
    from eligible a where a.is_historical_version
    union
    select c.start_id, a.id, a.version_parent_id, a.is_historical_version
    from connected c
    join public.artworks_discoverable a on a.id = c.parent_id or a.version_parent_id = c.id
    where a.version_kind is distinct from 'SUCCESSOR' or a.version_published_at is not null
  )
  select a.id, a.sku::text, a.title::text, a.title_en::text, a.primary_image_url::text,
    a.status::text, a.allows_prints
  from eligible a
  where not a.is_historical_version
    or exists (select 1 from connected c where c.start_id = a.id and not c.historical);
$$;
revoke all on function public.public_print_artworks(uuid[]) from public;
grant execute on function public.public_print_artworks(uuid[]) to anon, authenticated;

-- Historical versions require an explicit opt-in on the artwork. Existing
-- active rows are retained and can be made visible by enabling that setting.
create function public.guard_historical_print_publication()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_active and exists (
    select 1 from public.artworks a
    where a.id = new.artwork_id and a.is_historical_version and a.allows_prints is distinct from true
  ) then
    raise exception 'print_parent_disabled';
  end if;
  return new;
end $$;

create trigger guard_historical_print_publication
  before insert or update of is_active, artwork_id on public.artwork_prints
  for each row execute function public.guard_historical_print_publication();

commit;
