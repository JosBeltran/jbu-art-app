begin;

alter table public.artwork_prints
  add column if not exists title text,
  add column if not exists title_en text,
  add column if not exists description text,
  add column if not exists description_en text,
  add column if not exists image_url text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists sku text,
  add column if not exists currency text not null default 'MXN',
  add column if not exists paper_type text,
  add column if not exists framing text,
  add column if not exists prints_sold integer not null default 0;

-- Existing policies still determine access. Narrow client access to drafts and writes.
-- A pre-RLS installation needs a permissive read policy to preserve its public
-- active variant reads after enabling RLS. Installed RLS policies are kept intact.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.artwork_prints'::regclass) then
    create policy print_manager_legacy_public_read on public.artwork_prints
      for select to anon, authenticated using (is_active);
  end if;
end $$;
alter table public.artwork_prints enable row level security;
create policy print_manager_anon_read on public.artwork_prints
  as restrictive for select to anon using (is_active);
create policy print_manager_authenticated_read on public.artwork_prints
  as restrictive for select to authenticated using (is_active or public.is_jbu_admin());
create policy print_manager_insert on public.artwork_prints
  as restrictive for insert to authenticated with check (public.is_jbu_admin());
create policy print_manager_update on public.artwork_prints
  as restrictive for update to authenticated using (public.is_jbu_admin()) with check (public.is_jbu_admin());
create policy print_manager_delete on public.artwork_prints
  as restrictive for delete to authenticated using (public.is_jbu_admin());
create policy print_manager_anon_insert on public.artwork_prints
  as restrictive for insert to anon with check (false);
create policy print_manager_anon_update on public.artwork_prints
  as restrictive for update to anon using (false);
create policy print_manager_anon_delete on public.artwork_prints
  as restrictive for delete to anon using (false);

-- Keep legacy rows readable even if existing SKUs already conflict. New or changed SKUs
-- must be unique. The transaction lock serializes competing normalized SKU writes.
create index artwork_prints_normalized_sku on public.artwork_prints (lower(btrim(sku)))
  where sku is not null;

create function public.guard_managed_print_sku() returns trigger
language plpgsql security definer set search_path = public as $$
declare normalized text := nullif(lower(btrim(new.sku)), '');
begin
  if normalized is null or (tg_op = 'UPDATE' and new.sku is not distinct from old.sku) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('artwork_print_sku:' || normalized, 0));
  if exists (select 1 from public.artwork_prints p where p.id <> new.id
    and p.sku is not null and lower(btrim(p.sku)) = normalized) then
    raise exception 'duplicate_print_sku' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger guard_managed_print_sku before insert or update of sku on public.artwork_prints
  for each row execute function public.guard_managed_print_sku();

-- Service-only RPC. Admin identity, required fields and image URL are validated by the API.
-- Use the existing record type for any production enums. Operational fields are never accepted.
create function public.save_admin_artwork_print(_print jsonb, _create boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  p public.artwork_prints := jsonb_populate_record(null::public.artwork_prints, _print);
  v public.artwork_prints;
begin
  perform 1 from public.artworks where id = p.artwork_id for update;
  if not found then raise exception 'artwork_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('artwork_print_save:' || p.id::text, 0));
  select * into v from public.artwork_prints where id = p.id for update;

  if _create then
    if found then
      if to_jsonb(v) @> _print then return to_jsonb(v); end if;
      raise exception 'print_retry_conflict';
    end if;
    insert into public.artwork_prints (
      id, artwork_id, title, title_en, description, description_en, sku, size, finish, paper_type, framing,
      price, currency, edition_type, max_edition_size, sort_order, is_active, image_url,
      print_gallery_image_id, print_provenance_image_id
    ) values (
      p.id, p.artwork_id, p.title, p.title_en, p.description, p.description_en, p.sku, p.size, p.finish, p.paper_type, p.framing,
      p.price, p.currency, p.edition_type, p.max_edition_size, p.sort_order, p.is_active, p.image_url,
      p.print_gallery_image_id, p.print_provenance_image_id
    ) returning * into v;
  else
    if not found then raise exception 'print_not_found'; end if;
    -- Stripe sessions and paid orders may already reference this variant identity.
    if v.artwork_id is distinct from p.artwork_id or v.edition_type is distinct from p.edition_type then
      raise exception 'print_identity_locked';
    end if;
    if p.edition_type::text = 'LIMITED' and (p.max_edition_size < coalesce(v.prints_sold, 0)
       or (p.is_active and p.max_edition_size <= coalesce(v.prints_sold, 0)
           and (v.is_active is not true or p.max_edition_size is distinct from v.max_edition_size))) then
      raise exception 'invalid_print_inventory';
    end if;
    update public.artwork_prints set
      title = p.title, title_en = p.title_en, description = p.description, description_en = p.description_en,
      sku = p.sku, size = p.size, finish = p.finish, paper_type = p.paper_type, framing = p.framing,
      price = p.price, currency = p.currency, max_edition_size = p.max_edition_size, sort_order = p.sort_order,
      is_active = p.is_active, image_url = p.image_url, print_gallery_image_id = p.print_gallery_image_id,
      print_provenance_image_id = p.print_provenance_image_id
    where id = p.id returning * into v;
  end if;

  if v.is_active then
    update public.artworks set allows_prints = true where id = v.artwork_id and allows_prints is distinct from true;
  end if;
  return to_jsonb(v);
end $$;
revoke all on function public.save_admin_artwork_print(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_admin_artwork_print(jsonb, boolean) to service_role;

-- Use existing order snapshots as a lower bound without rewriting purchase history.
update public.artwork_prints p set prints_sold = greatest(coalesce(p.prints_sold, 0), history.sold)
from (
  select i.print_variant_id, sum(i.quantity)::integer sold
  from public.order_items i join public.orders o on o.id = i.order_id
  where i.print_variant_id is not null and o.payment_status::text = 'PAID'
  group by i.print_variant_id
) history
where p.id = history.print_variant_id and p.edition_type::text = 'LIMITED'
  and history.sold > coalesce(p.prints_sold, 0);

-- Registered fulfillment retains the existing order transaction. Lock and debit
-- limited variant rows inside it, using the legacy parent quota only for legacy prints.
create or replace function public.fulfill_stripe_order(_session text,_intent text,_email text,_name text,_phone text,_shipping jsonb,_amount numeric,_items jsonb,_auction uuid default null,_user uuid default null,_sale_type text default null,_auction_amount numeric default null,_promo uuid default null) returns uuid language plpgsql security definer set search_path=public,extensions as $fulfill$
declare oid uuid;it jsonb;a artworks%rowtype;ids uuid[];token text;result text;n integer;title text;sold_variant artwork_prints%rowtype;edition_limit integer;begin
 if jsonb_typeof(_items) is distinct from 'array' then raise exception 'invalid_items';end if;
 if _session is null or _amount is null or _amount<=0 or nullif(trim(_email),'') is null or jsonb_array_length(_items) not between 1 and 30 then raise exception 'invalid_payment';end if;
 perform pg_advisory_xact_lock(hashtextextended(_session,0));
 select id into oid from orders where stripe_session_id=_session;if oid is not null then return oid;end if;
 select array_agg((v->>'id')::uuid) into ids from jsonb_array_elements(_items) v;
 if exists (
    select 1 from jsonb_array_elements(_items) v
    group by case when v->>'type'='PRINT' and nullif(v->>'variant_id','') is not null
      then 'PRINT:'||(v->>'variant_id') else 'ARTWORK:'||(v->>'id') end
    having count(*) > 1
  ) then raise exception 'duplicate_item'; end if;
 perform 1 from artworks where id=any(ids) order by id for update;
 for it in select value from jsonb_array_elements(_items) loop
 select * into a from artworks where id=(it->>'id')::uuid;
 if not found then raise exception 'artwork_missing';end if;
 if coalesce(it->>'type','ORIGINAL') not in ('ORIGINAL','PRINT') or (it->>'quantity')::integer not between 1 and 100 or (it->>'unit_amount')::numeric<0 or it->>'unit_amount' is null or it->>'quantity' is null then raise exception 'invalid_item';end if;
 if it->>'type'='PRINT' and nullif(it->>'variant_id','') is null and a.print_type::text='LIMITED' and (a.print_edition_size is null or coalesce(a.prints_sold,0)+(it->>'quantity')::integer>a.print_edition_size) then raise exception 'print_edition_exhausted';end if;
 if coalesce(it->>'type','ORIGINAL')<>'PRINT' and (a.availability_status::text<>'AVAILABLE' or a.reserved_order_id is not null or a.current_owner_id is not null or a.pending_owner_id is not null) then raise exception 'artwork_unavailable';end if;
 end loop;
 if round((select sum((v->>'unit_amount')::numeric*(v->>'quantity')::integer) from jsonb_array_elements(_items) v),2)>round(_amount,2) then raise exception 'amount_mismatch';end if;
 if _auction is not null then
 result:=complete_auction_sale(_auction,_user,_sale_type,_auction_amount,_session);
 if result not in ('OK','ALREADY_PAID') then raise exception 'auction_conflict';end if;end if;
 insert into orders(stripe_session_id,stripe_payment_intent_id,buyer_email,buyer_name,buyer_phone,shipping_address,total_amount_mxn,status,payment_method,payment_status,paid_at,buyer_user_id) values(_session,_intent,_email,coalesce(_name,'Cliente Galería'),_phone,coalesce(_shipping,'{}'),_amount,'PAYMENT_RECEIVED','stripe','PAID',now(),
 case when not exists (select 1 from jsonb_array_elements(_items) i where i->>'type' is distinct from 'PRINT') then _user end)
 returning id into oid;
 for it in select value from jsonb_array_elements(_items) loop
 select * into a from artworks where id=(it->>'id')::uuid for update;
 token:=null;title:=a.title;
 if it->>'type'='PRINT' then
 if nullif(it->>'variant_id','') is not null then
   select * into sold_variant from artwork_prints where id=(it->>'variant_id')::uuid and artwork_id=a.id for update;
   if not found or (it ? 'edition_type' and sold_variant.edition_type::text is distinct from it->>'edition_type') then
     raise exception 'print_variant_mismatch';
   end if;
   perform set_config('jbu.registered_print_fulfillment','authorized',true);
   title:=coalesce(nullif(it->>'title',''),sold_variant.title,a.title);
   if sold_variant.edition_type::text='LIMITED' then
     n:=coalesce(sold_variant.prints_sold,0)+(it->>'quantity')::integer;
     edition_limit:=coalesce(sold_variant.max_edition_size,(to_jsonb(sold_variant)->>'edition_size')::integer,(to_jsonb(sold_variant)->>'print_limit')::integer);
     if edition_limit is null or n>edition_limit then raise exception 'print_edition_exhausted'; end if;
     update artwork_prints set prints_sold=n where id=sold_variant.id;
   end if;
 else
   n:=coalesce(a.prints_sold,0)+1;
   title:=title||case when a.print_type::text='LIMITED' then ' (Print #'||n||' de '||coalesce(a.print_edition_size,0)||')' else ' (Print)' end;
   update artworks set prints_sold=coalesce(prints_sold,0)+(it->>'quantity')::integer,updated_at=now() where id=a.id;
 end if;
 else token:=upper(encode(gen_random_bytes(8),'hex'));end if;
 insert into order_items(order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity,claim_token_snapshot,
     print_variant_id,print_size_snapshot,print_finish_snapshot,product_type_snapshot,print_image_url_snapshot)
   values(oid,a.id,title,case when it->>'type'='PRINT' then coalesce(nullif(it->>'sku',''),a.sku) else a.sku end,(it->>'unit_amount')::numeric,(it->>'quantity')::integer,token,
     case when it->>'type'='PRINT' then (select v.id from artwork_prints v where v.id=nullif(it->>'variant_id','')::uuid and v.artwork_id=a.id) else null end,
     case when it->>'type'='PRINT' then it->>'size' else null end,
     case when it->>'type'='PRINT' then it->>'finish' else null end,
     case when it->>'type'='PRINT' then 'PRINT' else 'ORIGINAL' end,
     case when it->>'type'='PRINT' then nullif(it->>'image_url','') else null end);
 end loop;
 perform complete_order_originals(oid);
 if _promo is not null then update welcome_promotions set status='REDEEMED',redeemed_at=now(),stripe_session_id=_session where id=_promo and status='CLAIMED';end if;
 return oid;
end $fulfill$;

-- A reproduction can belong to a numbered original without consuming a physical unit.
create or replace function public.block_unimplemented_physical_edition_sales()
returns trigger language plpgsql set search_path to 'public' as $function$
declare edition text;unit_artwork uuid;
begin
 if new.artwork_id is null then return new;end if;
 if new.product_type_snapshot='PRINT' and new.print_variant_id is not null then
   if current_setting('jbu.registered_print_fulfillment',true) is distinct from 'authorized'
      or new.claim_token_snapshot is not null or new.physical_edition_unit_id is not null
      or not exists (select 1 from public.artwork_prints v
        where v.id=new.print_variant_id and v.artwork_id=new.artwork_id)
   then raise exception 'invalid_registered_print_order_item';end if;
   return new;
 end if;
 if new.product_type_snapshot='OPEN_PRINT' then
   if current_setting('jbu.guest_open_print_fulfillment',true) is distinct from 'authorized'
      or new.claim_token_snapshot is not null or new.physical_edition_unit_id is not null
      or new.print_size_snapshot is null or new.print_finish_snapshot is null
      or (new.print_variant_id is not null and not exists (
        select 1 from public.artwork_prints v
        where v.id=new.print_variant_id and v.artwork_id=new.artwork_id
          and v.edition_type::text='OPEN'
      ))
   then raise exception 'invalid_open_print_order_item';end if;
   return new;
 end if;
 select physical_edition_type into edition from public.artworks where id=new.artwork_id;
 if edition='LIMITED_EDITION' then
   if current_setting('jbu.physical_edition_fulfillment',true) is distinct from 'authorized'
      or new.physical_edition_unit_id is null or new.claim_token_snapshot is not null
   then raise exception 'physical_edition_requires_unit_fulfillment';end if;
   select artwork_id into unit_artwork from public.artwork_edition_units where id=new.physical_edition_unit_id;
   if unit_artwork is distinct from new.artwork_id then raise exception 'physical_edition_unit_mismatch';end if;
 elsif new.physical_edition_unit_id is not null then
   raise exception 'unique_artwork_cannot_have_edition_unit';
 end if;
 return new;
end $function$;

commit;
