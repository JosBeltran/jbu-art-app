-- Install the admin operation without changing existing artworks.
begin;

create function public.artwork_successor_detach_blocker(_artwork uuid)
returns text language plpgsql stable set search_path = public as $$
declare a public.artworks%rowtype;
begin
  select * into a from public.artworks where id = _artwork;
  if not found then return 'artwork_not_found'; end if;
  if a.version_kind is distinct from 'SUCCESSOR' or a.version_parent_id is null
    or a.version_published_at is not null or a.status::text is distinct from 'DRAFT'
    or a.is_historical_version then
    return 'version_not_detachable';
  end if;

  if a.availability_status::text is distinct from 'NOT_FOR_SALE'
    or coalesce(a.ownership_status::text, '') not in ('AVAILABLE', 'NOT_FOR_SALE')
    or a.current_owner_id is not null or a.pending_owner_id is not null or a.reserved_order_id is not null
    or a.claim_token is not null or a.certificate_hash is not null
    or a.certificate_issued_at is not null or a.certificate_number is not null
    or a.physical_edition_sales_enabled or a.physical_edition_sales_activated_at is not null
    or exists (select 1 from public.order_items where artwork_id = a.id)
    or exists (select 1 from public.certificates where artwork_id = a.id)
    or exists (select 1 from public.physical_edition_certificates where artwork_id = a.id)
    or exists (select 1 from public.physical_edition_checkout_holds where artwork_id = a.id
      and status in ('HELD', 'PAID'))
    or exists (select 1 from public.artwork_edition_units where artwork_id = a.id
      and (status <> 'AVAILABLE' or order_item_id is not null or certificate_id is not null
        or physical_certificate_id is not null or reserved_at is not null or sold_at is not null))
    or exists (select 1 from public.auctions where artwork_id = a.id
      and status::text in ('UPCOMING', 'LIVE', 'SOLD'))
    or exists (select 1 from public.artwork_offers where artwork_id = a.id and status::text = 'ACCEPTED')
  then
    return 'version_commercially_committed';
  end if;
  return null;
end $$;

create function public.detach_artwork_successor(_id uuid, _parent uuid)
returns jsonb language plpgsql set search_path = public as $$
declare
  a public.artworks%rowtype;
  blocker text;
  prior_write_setting text := current_setting('jbu.artwork_version_write', true);
begin
  -- A full row lock also conflicts with new FK references to this artwork.
  -- Checkout, inventory configuration and successor publication lock this row.
  select * into a from public.artworks where id = _id for update;
  if not found then raise exception 'artwork_not_found'; end if;
  if _parent is null or a.version_parent_id is distinct from _parent then
    raise exception 'version_not_detachable';
  end if;
  blocker := public.artwork_successor_detach_blocker(_id);
  if blocker is not null then raise exception '%', blocker; end if;

  -- Keep the ordinary catalog draft and its commerce configuration intact.
  perform set_config('jbu.artwork_version_write', 'allowed', true);
  update public.artworks
    set version_parent_id = null, version_kind = null, updated_at = now()
    where id = a.id;
  perform set_config('jbu.artwork_version_write', coalesce(prior_write_setting, ''), true);

  -- Keep the system event's note and attachments, but retire its lineage links.
  update public.provenance_events
    set event_type = 'ARTWORK_VERSION_DETACHED', title = 'Convertida en obra independiente',
      visibility = 'ADMIN_ONLY', reference_type = null, reference_id = null,
      metadata = coalesce(metadata, '{}'::jsonb) - 'linked_event_id'
    where artwork_id = a.id and dedupe_key = 'ARTWORK_VERSION:' || a.id
      and event_type = 'ARTWORK_VERSION' and source = 'SYSTEM';
  return jsonb_build_object('id', a.id, 'sku', a.sku);
end $$;

revoke all on function public.artwork_successor_detach_blocker(uuid),
  public.detach_artwork_successor(uuid,uuid) from public, anon, authenticated;
grant execute on function public.artwork_successor_detach_blocker(uuid),
  public.detach_artwork_successor(uuid,uuid) to service_role;

create or replace function public.publish_artwork_version(_id uuid, _for_sale boolean)
returns jsonb language plpgsql set search_path = public as $$
declare parent uuid; a public.artworks; v public.artworks;
begin
  if _for_sale is null then raise exception 'invalid_version'; end if;
  select version_parent_id into parent from public.artworks where id=_id and version_kind='SUCCESSOR';
  if not found then raise exception 'artwork_not_found'; end if;
  select * into a from public.artworks where id=parent for update;
  select * into v from public.artworks where id=_id for update;
  -- The successor can be detached while publication waits for a row lock.
  if not found or v.version_kind is distinct from 'SUCCESSOR'
    or v.version_parent_id is distinct from parent then
    raise exception 'artwork_not_found';
  end if;
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

commit;
