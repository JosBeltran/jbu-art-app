begin;
-- Artwork Prints are source presentations; storefront prices belong to Studio products.
-- Legacy checkout still requires a positive price through its existing validators.
alter table public.artwork_prints drop constraint if exists print_active_price_required;
create function public.set_artwork_print_activity(_id uuid,_active boolean)
returns jsonb language plpgsql set search_path=public as $$
declare p artwork_prints; a artworks; parent_id uuid;
begin
  if _active is null then raise exception 'invalid_print'; end if;
  select artwork_id into parent_id from artwork_prints where id=_id;
  if not found then raise exception 'print_not_found'; end if;
  select * into a from artworks where id=parent_id for update;
  select * into p from artwork_prints where id=_id for update;
  if not found or p.artwork_id is distinct from parent_id then raise exception 'print_retry_conflict'; end if;
  if _active and a.is_historical_version and a.allows_prints is not true then raise exception 'print_parent_disabled'; end if;
  if _active and p.edition_type::text='LIMITED' and coalesce(p.max_edition_size,0)<=coalesce(p.prints_sold,0) then raise exception 'invalid_print_inventory'; end if;
  if _active then update artworks set allows_prints=true where id=parent_id and allows_prints is distinct from true; end if;
  update artwork_prints set is_active=_active where id=_id returning * into p;
  return jsonb_build_object('id',p.id,'is_active',p.is_active);
end $$;
revoke all on function public.set_artwork_print_activity(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_artwork_print_activity(uuid,boolean) to service_role;
notify pgrst,'reload schema';
commit;
