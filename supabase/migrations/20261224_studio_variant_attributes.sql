begin;

-- Keep the existing transactional draft creator and value storage. Expand the
-- attribute dictionary only when a verified, server-built draft uses a field.
alter function public.save_wall_art_studio(uuid,uuid,jsonb) rename to save_wall_art_studio_core;

create function public.save_wall_art_studio(_actor uuid,_session uuid,_products jsonb)
returns uuid[] language plpgsql set search_path=public as $$
declare ids uuid[];
begin
  perform 1 from product_discovery_sessions where id=_session and created_by=_actor
    and artwork_id is not null and state<>'archived' for update;
  if not found then raise exception 'wall_art_session_invalid'; end if;
  select product_ids into ids from wall_art_studio_saves where session_id=_session;
  if found then return ids; end if;

  insert into product_attributes(code,label_es,label_en,value_type)
  select distinct code,initcap(replace(code,'_',' ')),initcap(replace(code,'_',' ')),'string'
  from jsonb_array_elements(_products) as p
  cross join lateral jsonb_array_elements(p->'variants') as v
  cross join lateral jsonb_object_keys(coalesce(v->'attributes','{}')) as code
  where code ~ '^[a-z][a-z0-9_]{0,63}$'
  order by code
  on conflict (code) do nothing;

  return save_wall_art_studio_core(_actor,_session,_products);
end $$;

revoke all on function public.save_wall_art_studio(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_wall_art_studio(uuid,uuid,jsonb) to service_role;
commit;
