begin;

-- Existing installations can have a bounded SKU and required creation timestamp
-- or provenance description. Keep the version insert compatible with those fields.
create or replace function public.create_artwork_version(
  _parent uuid, _id uuid, _kind text, _title text, _image text, _note text, _event uuid
) returns jsonb language plpgsql set search_path = public as $$
declare a public.artworks; v public.artworks; version_image text;
begin
  if _id is null or _id = _parent or _kind is null or _kind not in ('SNAPSHOT','SUCCESSOR')
    or nullif(trim(_title),'') is null or length(_title)>200 or length(_note)>2000 then
    raise exception 'invalid_version';
  end if;
  select * into a from public.artworks where id=_parent for update;
  if not found then raise exception 'artwork_not_found'; end if;
  version_image := coalesce(nullif(trim(_image),''), case when _kind='SNAPSHOT' then a.primary_image_url end);
  if version_image is null or btrim(version_image) = '' then raise exception 'version_image_required'; end if;
  select * into v from public.artworks where id=_id;
  if found then
    if v.version_parent_id = _parent and v.version_kind = _kind
      and v.title = btrim(_title) and v.primary_image_url = version_image
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
    _id, 'ver-' || left(md5(_id::text),16), btrim(_title),
    case when _title=a.title then a.title_en end, a.series, a.series_id, a.artist_profile_id,
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
