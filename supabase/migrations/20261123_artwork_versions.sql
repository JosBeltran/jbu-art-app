begin;

alter table public.artworks
  add column version_parent_id uuid references public.artworks(id) on delete restrict,
  add column version_kind text,
  add column is_historical_version boolean not null default false,
  add column version_published_at timestamptz,
  add constraint artwork_version_lineage check (
    (version_parent_id is null and version_kind is null and version_published_at is null)
    or (version_parent_id is not null and version_kind is not null and version_kind in ('SNAPSHOT', 'SUCCESSOR')
        and version_parent_id <> id and (version_kind <> 'SNAPSHOT' or is_historical_version))
  ),
  add constraint artwork_version_sale_guard check (
    (not is_historical_version or (availability_status::text = 'NOT_FOR_SALE' and accepts_offers is not true))
    and (version_kind is distinct from 'SUCCESSOR' or version_published_at is not null
      or (status::text = 'DRAFT' and availability_status::text = 'NOT_FOR_SALE' and accepts_offers is not true))
  );

create index artwork_version_parent_idx on public.artworks(version_parent_id) where version_parent_id is not null;
create unique index artwork_single_successor on public.artworks(version_parent_id) where version_kind = 'SUCCESSOR';

-- Keep the existing view eligible for print checkout. Its consumers can hide historical rows
-- from storefront discovery while the old SKU still resolves for print purchases.
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

create function public.guard_artwork_version_metadata()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('jbu.artwork_version_write', true) = 'allowed' then return new; end if;
  if tg_op = 'INSERT' then
    if new.version_parent_id is not null or new.version_kind is not null or new.is_historical_version
      or new.version_published_at is not null then
      raise exception 'use_artwork_version_workflow';
    end if;
  elsif (new.version_parent_id, new.version_kind, new.is_historical_version, new.version_published_at)
        is distinct from
        (old.version_parent_id, old.version_kind, old.is_historical_version, old.version_published_at)
    or (old.version_kind = 'SUCCESSOR' and old.version_published_at is not null and new.status::text = 'DRAFT'
      and old.status is distinct from new.status) then
    raise exception 'use_artwork_version_workflow';
  end if;
  return new;
end $$;

create trigger guard_artwork_version_metadata before insert or update on public.artworks
  for each row execute function public.guard_artwork_version_metadata();

-- Version events have their own date and meaning. A version copy is not a new
-- physical creation, so omit the generic CREATED event for its fresh record.
create or replace function public.trg_provenance_artworks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      if new.version_parent_id is null then
        perform public.provenance_record_artwork_created(to_jsonb(new));
      end if;
    elsif new.certificate_hash is not null and new.certificate_hash is distinct from old.certificate_hash then
      perform public.record_provenance(new.id, 'CERTIFICATE_ISSUED', 'Digital Certificate of Authenticity issued',
        'The work was registered in the JBU certificate system with its unique authenticity record.',
        to_char(coalesce(new.certificate_issued_at::timestamptz, now()), 'YYYY-MM-DD'), 'DAY',
        'CERTIFICATE', new.id::text, 'CERTIFICATE_ISSUED:' || new.id || ':' || new.certificate_hash);
    end if;
  exception when others then raise warning 'provenance artworks: %', sqlerrm;
  end;
  return new;
end $$;

create function public.create_artwork_version(
  _parent uuid, _id uuid, _kind text, _title text, _image text, _note text, _event uuid
) returns jsonb language plpgsql set search_path = public as $$
declare a public.artworks; v public.artworks; image text;
begin
  if _id is null or _id = _parent or _kind is null or _kind not in ('SNAPSHOT','SUCCESSOR')
    or nullif(trim(_title),'') is null or length(_title)>200 or length(_note)>2000 then
    raise exception 'invalid_version';
  end if;
  select * into a from public.artworks where id=_parent for update;
  if not found then raise exception 'artwork_not_found'; end if;
  image := coalesce(nullif(trim(_image),''), case when _kind='SNAPSHOT' then a.primary_image_url end);
  if image is null or btrim(image) = '' then raise exception 'version_image_required'; end if;
  select * into v from public.artworks where id=_id;
  if found then
    if v.version_parent_id = _parent and v.version_kind = _kind
      and v.title = btrim(_title) and v.primary_image_url = image
      and exists (select 1 from public.provenance_events p where p.dedupe_key='ARTWORK_VERSION:' || v.id
        and p.description is not distinct from nullif(btrim(_note),'')
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
    version_published_at
  )
  values (
    _id, 'version-' || replace(_id::text,'-',''), btrim(_title),
    case when _title=a.title then a.title_en end, a.series, a.series_id, a.artist_profile_id,
    a.medium, a.medium_en, a.year, a.dimensions, a.description, a.description_en, image,
    0, 0, v.status,
    'NOT_FOR_SALE','AVAILABLE',false,false,false,a.id,_kind,_kind='SNAPSHOT',
    case when _kind='SNAPSHOT' then now() end
  ) returning * into v;

  perform public.record_provenance(v.id,'ARTWORK_VERSION',
    case when _kind='SNAPSHOT' then 'Versión anterior' else 'Versión sucesora' end,
    nullif(btrim(_note),''), to_char(now() at time zone 'America/Monterrey','YYYY-MM-DD'),
    'DAY','ARTWORK',a.id::text,'ARTWORK_VERSION:' || v.id,
    case when _kind='SNAPSHOT' and exists (
      select 1 from public.artworks_discoverable x where x.id=a.id
    ) then 'PUBLIC' else 'ADMIN_ONLY' end,
    jsonb_strip_nulls(jsonb_build_object('linked_event_id',_event)));
  return jsonb_build_object('id',v.id,'sku',v.sku);
end $$;

create function public.publish_artwork_version(_id uuid, _for_sale boolean)
returns jsonb language plpgsql set search_path = public as $$
declare parent uuid; a public.artworks; v public.artworks;
begin
  if _for_sale is null then raise exception 'invalid_version'; end if;
  select version_parent_id into parent from public.artworks where id=_id and version_kind='SUCCESSOR';
  if not found then raise exception 'artwork_not_found'; end if;
  select * into a from public.artworks where id=parent for update;
  select * into v from public.artworks where id=_id for update;
  if not found then raise exception 'artwork_not_found'; end if;
  if v.version_published_at is not null then return jsonb_build_object('id',v.id,'sku',v.sku); end if;
  if a.is_historical_version or a.physical_edition_type <> 'UNIQUE'
    or a.status::text not in ('AVAILABLE','OWNED')
    or a.availability_status::text not in ('AVAILABLE','NOT_FOR_SALE')
    or coalesce(a.ownership_status::text,'') not in ('AVAILABLE','NOT_FOR_SALE')
    or a.current_owner_id is not null or a.pending_owner_id is not null or a.reserved_order_id is not null
    or a.certificate_hash is not null or a.certificate_issued_at is not null
    or exists (select 1 from public.auctions x where x.artwork_id=a.id and
      (x.status::text in ('UPCOMING','LIVE') or (x.status::text='SOLD' and x.payment_status='PENDING')))
    or exists (select 1 from public.artwork_offers x where x.artwork_id=a.id
      and x.status::text='ACCEPTED' and x.payment_status='PENDING') then
    raise exception 'version_predecessor_locked';
  end if;
  if v.physical_edition_type <> 'UNIQUE' or v.current_owner_id is not null or v.pending_owner_id is not null
    or v.reserved_order_id is not null or v.certificate_hash is not null or v.certificate_issued_at is not null
    or coalesce(v.ownership_status::text,'') not in ('AVAILABLE','NOT_FOR_SALE') then
    raise exception 'invalid_version';
  end if;
  if nullif(btrim(v.primary_image_url),'') is null then raise exception 'version_image_required'; end if;
  if _for_sale and (coalesce(v.calculated_price_mxn,v.base_price_mxn,0)<=0
    or coalesce(v.price_display_mode::text,'SHOW_PRICE')<>'SHOW_PRICE') then
    raise exception 'version_price_required';
  end if;

  perform set_config('jbu.artwork_version_write','allowed',true);
  update public.artworks set
    availability_status='NOT_FOR_SALE', is_historical_version=true, accepts_offers=false, updated_at=now()
  where id=a.id;
  update public.artworks set status='AVAILABLE', availability_status=
    case when _for_sale then 'AVAILABLE'::public.availability_status else 'NOT_FOR_SALE'::public.availability_status end,
    version_published_at=now(), updated_at=now()
  where id=v.id;
  if exists (select 1 from public.artworks_discoverable x where x.id=v.id) then
    update public.provenance_events set visibility='PUBLIC' where dedupe_key='ARTWORK_VERSION:' || v.id;
  end if;
  return jsonb_build_object('id',v.id,'sku',v.sku);
end $$;

revoke all on function public.create_artwork_version(uuid,uuid,text,text,text,text,uuid),
  public.publish_artwork_version(uuid,boolean) from public, anon, authenticated;
grant execute on function public.create_artwork_version(uuid,uuid,text,text,text,text,uuid),
  public.publish_artwork_version(uuid,boolean) to service_role;

-- Public projection honors both existing artwork RLS and effective Series visibility.
create function public.public_artwork_versions(_artwork uuid)
returns table (id uuid, version_parent_id uuid, depth int, title text, title_en text,
  sku text, primary_image_url text, is_historical_version boolean, allows_prints boolean)
language sql stable set search_path = public as $$
  with recursive ancestors as (
    select a.id,a.version_parent_id,0 distance
    from public.artworks_discoverable a where a.id=_artwork
    union all
    select a.id,a.version_parent_id,p.distance+1
    from public.artworks_discoverable a join ancestors p on a.id=p.version_parent_id
  ), tree as (
    select p.id,p.version_parent_id,0 depth from (select * from ancestors order by distance desc limit 1) p
    union all
    select a.id,a.version_parent_id,p.depth+1
    from public.artworks_discoverable a join tree p on a.version_parent_id=p.id
  )
  select a.id,a.version_parent_id,p.depth,a.title::text,a.title_en::text,a.sku::text,
    a.primary_image_url::text,a.is_historical_version,
    a.allows_prints and exists (select 1 from public.artwork_prints v where v.artwork_id=a.id and v.is_active
      and v.is_available is distinct from false and v.price>0)
  from tree p join public.artworks_discoverable a using (id)
  where exists (select 1 from tree t join public.artworks_discoverable current_art using (id)
    where not current_art.is_historical_version)
  order by a.is_historical_version,p.depth desc,a.created_at desc,a.id;
$$;
revoke all on function public.public_artwork_versions(uuid) from public;
grant execute on function public.public_artwork_versions(uuid) to anon, authenticated;

commit;
