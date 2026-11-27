begin;

alter table public.artworks add column historical_version_number integer
  check (historical_version_number > 0);

-- The counter is scoped to the oldest artwork in the version family.
create table public.artwork_version_counters (
  family_id uuid primary key,
  last_number integer not null check (last_number > 0)
);
alter table public.artwork_version_counters enable row level security;
revoke all on public.artwork_version_counters from public, anon, authenticated;

create function public.artwork_version_family_root(_id uuid)
returns uuid language sql stable set search_path = public as $$
  with recursive ancestors as (
    select id, version_parent_id from public.artworks where id = _id
    union all
    select a.id, a.version_parent_id
    from public.artworks a join ancestors p on a.id = p.version_parent_id
  )
  select id from ancestors where version_parent_id is null
$$;

create function public.artwork_version_base_title(_title text)
returns text language sql immutable strict set search_path = public as $$
  select nullif(btrim(regexp_replace(
    regexp_replace(_title, '[[:space:]]+$', ''),
    '(?:[[:space:]]*·(?:[[:space:]]|&#x20;)*#)?(?:[[:space:]]*·(?:[[:space:]]|&#x20;)*(?:versi[oó]n anterior|earlier version|previous version|v[0-9]+))+(?:[[:space:]]|&#x20;)*$',
    '', 'i'
  )), '')
$$;

create function public.numbered_artwork_version_title(_title text, _number integer)
returns text language sql immutable strict set search_path = public as $$
  select _title || ' · V' || case when _number < 10 then '0' else '' end || _number::text
$$;

with numbered as (
  select id, public.artwork_version_family_root(id) as family_id,
    row_number() over (
      partition by public.artwork_version_family_root(id) order by created_at, id
    )::integer as version_number
  from public.artworks where is_historical_version
), updated as (
  update public.artworks as artwork
  set historical_version_number = numbered.version_number,
      title = public.numbered_artwork_version_title(
        coalesce(public.artwork_version_base_title(artwork.title), artwork.sku), numbered.version_number
      ),
      title_en = public.numbered_artwork_version_title(
        public.artwork_version_base_title(artwork.title_en), numbered.version_number
      )
  from numbered where artwork.id = numbered.id
  returning numbered.family_id, numbered.version_number
)
insert into public.artwork_version_counters (family_id, last_number)
select family_id, max(version_number) from updated group by family_id;

alter table public.artworks add constraint artwork_historical_version_number_required
  check (is_historical_version = (historical_version_number is not null));

create function public.set_historical_artwork_version_title()
returns trigger language plpgsql security definer set search_path = public as $$
declare family uuid;
begin
  if not new.is_historical_version then
    new.historical_version_number := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.historical_version_number is not null then
    new.historical_version_number := old.historical_version_number;
  else
    family := coalesce(public.artwork_version_family_root(new.version_parent_id), new.id);
    insert into public.artwork_version_counters as counter (family_id, last_number)
    values (family, 1)
    on conflict (family_id) do update set last_number = counter.last_number + 1
    returning last_number into new.historical_version_number;
  end if;

  new.title := public.numbered_artwork_version_title(
    coalesce(public.artwork_version_base_title(new.title), new.sku), new.historical_version_number
  );
  new.title_en := public.numbered_artwork_version_title(
    public.artwork_version_base_title(new.title_en), new.historical_version_number
  );
  return new;
end $$;

revoke all on function public.set_historical_artwork_version_title() from public, anon, authenticated;

create trigger set_historical_artwork_version_title
  before insert or update of title, title_en, is_historical_version, historical_version_number
  on public.artworks for each row execute function public.set_historical_artwork_version_title();

-- Compare snapshot retries against the base title and preserve matching translations.
create or replace function public.create_artwork_version(
  _parent uuid, _id uuid, _kind text, _title text, _image text, _note text, _event uuid
) returns jsonb language plpgsql set search_path = public as $$
declare a public.artworks; v public.artworks; version_image text; version_title text;
begin
  if _id is null or _id = _parent or _kind is null or _kind not in ('SNAPSHOT','SUCCESSOR')
    or nullif(trim(_title),'') is null or length(_title)>200 or length(_note)>2000 then
    raise exception 'invalid_version';
  end if;
  version_title := case when _kind = 'SNAPSHOT'
    then public.artwork_version_base_title(_title) else btrim(_title) end;
  if version_title is null then raise exception 'invalid_version'; end if;
  select * into a from public.artworks where id=_parent for update;
  if not found then raise exception 'artwork_not_found'; end if;
  version_image := coalesce(nullif(trim(_image),''), case when _kind='SNAPSHOT' then a.primary_image_url end);
  if version_image is null or btrim(version_image) = '' then raise exception 'version_image_required'; end if;
  select * into v from public.artworks where id=_id;
  if found then
    if v.version_parent_id = _parent and v.version_kind = _kind
      and (case when v.is_historical_version then public.artwork_version_base_title(v.title) else v.title end) = version_title
      and v.primary_image_url = version_image
      and exists (select 1 from public.provenance_events p where p.dedupe_key='ARTWORK_VERSION:' || v.id
        and nullif(p.description,'') is not distinct from nullif(btrim(_note),'')
        and p.metadata->>'linked_event_id' is not distinct from _event::text) then
      return jsonb_build_object('id',v.id,'sku',v.sku);
    end if;
    raise exception 'version_id_conflict';
  end if;
  if a.version_kind='SUCCESSOR' and a.version_published_at is null then raise exception 'version_parent_unpublished'; end if;
  if _kind='SUCCESSOR' and (a.is_historical_version or a.physical_edition_type <> 'UNIQUE') then
    raise exception 'invalid_version_predecessor';
  end if;
  if _event is not null and not exists (
    select 1 from public.provenance_events p where p.id=_event and p.artwork_id=_parent
  ) then raise exception 'invalid_version_event'; end if;

  if _kind='SNAPSHOT' then v.status := 'AVAILABLE'; else v.status := 'DRAFT'; end if;
  perform set_config('jbu.artwork_version_write','allowed',true);
  -- Allowlist editorial fields. Never copy identifiers, sale/ownership data, gallery,
  -- physical editions, certificates, print offers, inventory, or transactions.
  insert into public.artworks (
    id, sku, title, title_en, series, series_id, artist_profile_id, medium, medium_en,
    year, dimensions, description, description_en, primary_image_url,
    base_price_mxn, calculated_price_mxn, status, availability_status, ownership_status, featured,
    allows_prints, accepts_offers, version_parent_id, version_kind, is_historical_version,
    version_published_at, created_at
  )
  values (
    _id, 'ver-' || left(md5(_id::text),16), version_title,
    case when version_title = (case when _kind = 'SNAPSHOT' then public.artwork_version_base_title(a.title) else a.title end)
      then a.title_en end, a.series, a.series_id, a.artist_profile_id,
    a.medium, a.medium_en, a.year, a.dimensions, a.description, a.description_en, version_image,
    0, 0, v.status,
    'NOT_FOR_SALE','AVAILABLE',false,false,false,a.id,_kind,_kind='SNAPSHOT',
    case when _kind='SNAPSHOT' then now() end, now()
  ) returning * into v;

  perform public.record_provenance(v.id,'ARTWORK_VERSION',
    case when _kind='SNAPSHOT' then 'Versión anterior' else 'Versión sucesora' end,
    coalesce(btrim(_note),''), to_char(now() at time zone 'America/Monterrey','YYYY-MM-DD'),
    'DAY','ARTWORK',a.id::text,'ARTWORK_VERSION:' || v.id,
    case when _kind='SNAPSHOT' and exists (
      select 1 from public.artworks_discoverable x where x.id=a.id
    ) then 'PUBLIC' else 'ADMIN_ONLY' end,
    jsonb_strip_nulls(jsonb_build_object('linked_event_id',_event)), 'SYSTEM');
  return jsonb_build_object('id',v.id,'sku',v.sku);
end $$;

revoke all on function public.create_artwork_version(uuid,uuid,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.create_artwork_version(uuid,uuid,text,text,text,text,uuid) to service_role;

notify pgrst, 'reload schema';

commit;
