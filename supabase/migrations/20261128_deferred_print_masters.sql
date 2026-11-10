begin;

-- READY in generation_status continues to describe a successfully saved preview.
alter table public.print_asset_generations
  alter column production_file_path drop not null,
  add column revision_id uuid not null default gen_random_uuid() unique,
  add column production_status text not null default 'MASTER_READY',
  add column master_source_ref jsonb,
  add column master_approved_at timestamptz,
  add column master_lease uuid,
  add column master_lease_until timestamptz,
  add column master_error text,
  add constraint print_master_state_consistent check (
    production_status in ('PREVIEW_ONLY','MASTER_PENDING','MASTER_GENERATING','MASTER_READY','MASTER_FAILED','MASTER_STALE')
    and ((production_status = 'MASTER_READY') = (production_file_path is not null))
    and (production_file_path is null or btrim(production_file_path) <> '')
    and (master_approved_at is null or production_status = 'MASTER_READY')
    and (production_status = 'MASTER_READY' or (layout is not null and jsonb_typeof(layout) = 'object'))
    and ((production_status = 'MASTER_GENERATING') = (master_lease is not null and master_lease_until is not null))
    and (master_lease is null) = (master_lease_until is null)
  );

update public.print_asset_generations set master_approved_at=generated_at;

create index print_asset_preview_revision on public.print_asset_generations (print_id, preview_image_url);

create function public.commit_print_asset_revision(
  _artwork uuid, _request uuid, _by uuid, _new_print uuid, _size text, _edition text,
  _selected uuid, _replace boolean, _expected_revision uuid,
  _master text, _preview text, _source jsonb, _border text, _dpi integer,
  _title text, _description text, _price numeric, _limit integer, _layout jsonb
) returns jsonb language plpgsql set search_path = public as $$
declare
  parent public.artworks;
  variant public.artwork_prints;
  edition_value public.artwork_prints;
  saved public.print_asset_generations;
  current_revision uuid;
  candidates uuid[];
begin
  if _request is null or _by is null or _new_print is null or _size is null or _size not in ('A2','A1')
    or _edition is null or _edition not in ('OPEN','LIMITED') or (_price is not null and _price <= 0)
    or (_selected is null and _edition = 'LIMITED' and coalesce(_limit, 0) < 1)
    or _replace is null or _master = '' or nullif(_preview,'') is null
    or jsonb_typeof(_layout) is distinct from 'object'
    or _layout->>'algorithmVersion' is distinct from '1'
    or _layout->>'size' is distinct from _size
    or not (_layout ?& array['width','height','left','top','artworkWidth','artworkHeight',
      'paperWidthMm','paperHeightMm','outputDpi','minimumEffectiveDpi','marginsMm','paperType'])
    or _source->>'sha256' is null then
    raise exception 'invalid_options';
  end if;

  -- The normal admin print manager uses the same artwork-row lock.
  select * into parent from public.artworks where id = _artwork for update;
  if not found then raise exception 'artwork_not_found'; end if;
  select * into saved from public.print_asset_generations where request_id = _request and size = _size;
  if found then
    if saved.artwork_id <> _artwork or saved.generated_by <> _by then raise exception 'generation_conflict'; end if;
    return to_jsonb(saved);
  end if;

  -- Match legacy size labels such as "A2 · 42 × 59.4 cm" as well as bare A2.
  select array_agg(v.id order by v.id) into candidates from public.artwork_prints v
  where v.artwork_id = _artwork and v.edition_type::text = _edition and v.finish::text = 'FINE_ART'
    and upper(btrim(v.size)) ~ ('^' || _size || '([^A-Z0-9]|$)');

  if _selected is null and coalesce(cardinality(candidates),0) > 0 then
    raise exception 'generation_conflict';
  end if;

  if _selected is not null then
    if not _replace or not coalesce(_selected = any(candidates), false) then
      raise exception 'generation_conflict';
    end if;
    select * into variant from public.artwork_prints where id = _selected for update;
    if not found or variant.artwork_id <> _artwork or variant.edition_type::text <> _edition
      or variant.finish::text <> 'FINE_ART' or not upper(btrim(variant.size)) ~ ('^' || _size || '([^A-Z0-9]|$)') then
      raise exception 'generation_conflict';
    end if;
    select revision_id into current_revision from public.print_asset_generations
    where print_id = variant.id and is_current;
    if current_revision is distinct from _expected_revision then raise exception 'generation_conflict'; end if;

    -- Keep prior revisions usable for orders which already selected them.
    update public.print_asset_generations set is_current = false,
      production_status = case when production_status in ('PREVIEW_ONLY','MASTER_PENDING','MASTER_FAILED')
        then 'MASTER_STALE' else production_status end
    where print_id = variant.id and is_current;

    -- Commercial fields and variant identity are preserved, even when already sold.
    update public.artwork_prints set image_url = _preview, paper_type = _layout->>'paperType',
      print_gallery_image_id = null, print_provenance_image_id = null
    where id = variant.id;
  else
    edition_value := jsonb_populate_record(null::public.artwork_prints, jsonb_build_object('edition_type', _edition));
    insert into public.artwork_prints (
      id, artwork_id, size, finish, edition_type, price, currency, is_active, title, title_en,
      description, description_en, paper_type, max_edition_size, image_url
    ) values (
      _new_print, _artwork, _size, 'FINE_ART', edition_value.edition_type,
      _price, 'MXN', false,
      coalesce(nullif(btrim(_title),''), left(parent.title, 194) || ' · ' || _size),
      case when nullif(btrim(_title),'') is null and nullif(parent.title_en,'') is not null
        then left(parent.title_en,194) || ' · ' || _size end,
      coalesce(nullif(btrim(_description),''), parent.description),
      case when nullif(btrim(_description),'') is null then parent.description_en end,
      _layout->>'paperType', case when _edition = 'LIMITED' then _limit end, _preview
    ) returning * into variant;
  end if;

  insert into public.print_asset_generations (
    request_id, size, artwork_id, print_id, production_file_path, preview_image_url,
    source_image_ref, border_mode, effective_dpi, generated_by, layout, production_status, master_source_ref, master_approved_at
  ) values (_request, _size, _artwork, variant.id, _master, _preview, _source, _border, _dpi, _by, _layout,
    case when _master is null then 'PREVIEW_ONLY' else 'MASTER_READY' end,
    case when _master is not null then _source end, case when _master is not null then now() end)
  returning * into saved;
  return to_jsonb(saved);
end $$;

revoke all on function public.commit_print_asset_revision(
  uuid,uuid,uuid,uuid,text,text,uuid,boolean,uuid,text,text,jsonb,text,integer,text,text,numeric,integer,jsonb
) from public, anon, authenticated;
grant execute on function public.commit_print_asset_revision(
  uuid,uuid,uuid,uuid,text,text,uuid,boolean,uuid,text,text,jsonb,text,integer,text,text,numeric,integer,jsonb
) to service_role;


-- Published geometry is changed through a new revision, never through generic edits.
create function public.guard_versioned_print_specs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.size, new.finish, new.paper_type, new.image_url, new.print_gallery_image_id, new.print_provenance_image_id)
    is distinct from (old.size, old.finish, old.paper_type, old.image_url, old.print_gallery_image_id, old.print_provenance_image_id)
    and exists (select 1 from print_asset_generations g where g.print_id=old.id and g.is_current and g.layout ? 'algorithmVersion')
  then raise exception 'print_specs_locked'; end if;
  return new;
end $$;
create trigger guard_versioned_print_specs before update of size,finish,paper_type,image_url,print_gallery_image_id,print_provenance_image_id
on public.artwork_prints for each row execute function public.guard_versioned_print_specs();

alter table public.order_items add column print_asset_revision_id uuid, add column print_framing_snapshot text;
create table public.print_order_preparations (
  item_id uuid primary key references public.order_items(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  revision_id uuid references public.print_asset_generations(revision_id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  state text not null check (state in ('AWAITING_PREPARATION','AWAITING_APPROVAL','READY','MANUAL_REVIEW')),
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  check ((state = 'READY') = (approved_at is not null)),
  check (state = 'MANUAL_REVIEW' or revision_id is not null)
);
create index print_order_preparations_queue on public.print_order_preparations (state, created_at, item_id);
create index print_order_preparations_order on public.print_order_preparations (order_id);
create index print_order_preparations_revision on public.print_order_preparations (revision_id);
alter table public.print_order_preparations enable row level security;
revoke all on public.print_order_preparations from public, anon, authenticated;
grant select on public.print_order_preparations to service_role;

create function public.capture_print_preparation() returns trigger
language plpgsql security definer set search_path = public as $$
declare g print_asset_generations; next_state text; recipient record;
begin
  if coalesce(new.product_type_snapshot,'') not in ('PRINT','OPEN_PRINT') then return new; end if;
  -- Pre-deployment sessions may only have the exact preview URL.
  select * into g from print_asset_generations
  where artwork_id=new.artwork_id and print_id=new.print_variant_id
    and ((new.print_asset_revision_id is not null and revision_id=new.print_asset_revision_id
        and preview_image_url=new.print_image_url_snapshot)
      or (new.print_asset_revision_id is null and preview_image_url=new.print_image_url_snapshot))
  order by generated_at desc limit 1 for update;
  if g.revision_id is null and new.print_asset_revision_id is null then return new; end if;
  next_state := case
    when g.revision_id is null then 'MANUAL_REVIEW'
    when g.production_status = 'MASTER_READY' and (g.master_approved_at is not null or g.layout->>'algorithmVersion' is distinct from '1') then 'READY'
    when g.production_status = 'MASTER_READY' then 'AWAITING_APPROVAL'
    else 'AWAITING_PREPARATION' end;
  insert into print_order_preparations(item_id,order_id,revision_id,snapshot,state,approved_at)
  values(new.id,new.order_id,g.revision_id,jsonb_build_object(
    'title',new.title_snapshot,'sku',new.sku_snapshot,'size',new.print_size_snapshot,'finish',new.print_finish_snapshot,
    'framing',new.print_framing_snapshot,'quantity',new.quantity,'unitPriceMxn',new.unit_price_mxn,'preview',coalesce(g.preview_image_url,new.print_image_url_snapshot),'layout',g.layout,
    'variantId',new.print_variant_id,'artworkId',new.artwork_id,'purchasedRevision',new.print_asset_revision_id),
    next_state,case when next_state='READY' then now() end);
  if next_state='AWAITING_PREPARATION' and g.production_status='PREVIEW_ONLY' then
    update print_asset_generations set production_status='MASTER_PENDING' where revision_id=g.revision_id
      and production_status='PREVIEW_ONLY';
  end if;
  if next_state<>'READY' then
    begin
      for recipient in select ur.user_id, u.email from user_roles ur join auth.users u on u.id=ur.user_id
        where ur.role::text='admin'
      loop
        perform enqueue_notification(recipient.user_id,recipient.email,'PRINT_PREPARATION','ORDER',new.order_id::text,
          'print-preparation:'||new.order_id||':'||recipient.user_id,
          '/admin/orders/production?order='||new.order_id,
          'Pedido pagado: prepara el archivo de impresión','Paid order: prepare the print master');
      end loop;
    exception when others then raise warning 'print preparation notification could not be queued (%)',sqlstate;
    end;
  end if;
  return new;
end $$;
create trigger capture_print_preparation after insert on public.order_items
for each row execute function public.capture_print_preparation();

-- Fenced leases protect retries and concurrent preparation of the same revision.
create function public.claim_print_master(_revision uuid, _lease uuid) returns boolean
language sql security definer set search_path = public as $$
  with claimed as (
    update print_asset_generations set production_status='MASTER_GENERATING',master_error=null,
      master_lease=_lease,master_lease_until=now()+interval '5 minutes'
    where revision_id=_revision and layout->>'algorithmVersion'='1' and production_file_path is null
      and (production_status<>'MASTER_GENERATING' or master_lease_until<now())
      and (is_current or exists (select 1 from print_order_preparations where revision_id=_revision))
    returning 1
  ) select exists(select 1 from claimed);
$$;

create function public.complete_print_master(_revision uuid, _lease uuid, _path text, _source jsonb, _error text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update print_asset_generations set production_status=case when _path is null then 'MASTER_FAILED' else 'MASTER_READY' end,
    production_file_path=_path,master_source_ref=_source,master_error=_error,master_lease=null,master_lease_until=null
  where revision_id=_revision and master_lease=_lease and master_lease_until>=now();
  if not found then return false; end if;
  if _path is not null then
    update print_order_preparations set state='AWAITING_APPROVAL'
    where revision_id=_revision and state='AWAITING_PREPARATION';
  end if;
  return true;
end $$;

create function public.approve_print_order_master(_item uuid, _revision uuid, _by uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from print_asset_generations where revision_id=_revision and production_status='MASTER_READY' for update;
  if not found then return false; end if;
  update print_order_preparations p set state='READY',approved_at=now(),approved_by=_by
  where p.item_id=_item and p.revision_id=_revision and p.state='AWAITING_APPROVAL'
    and exists (select 1 from orders where id=p.order_id and payment_status::text='PAID' and status::text<>'CANCELLED');
  if found then
    update print_asset_generations set master_approved_at=now() where revision_id=_revision and master_approved_at is null;
    return true;
  end if;
  return exists(select 1 from print_order_preparations where item_id=_item and revision_id=_revision and state='READY');
end $$;

revoke all on function public.claim_print_master(uuid,uuid), public.complete_print_master(uuid,uuid,text,jsonb,text),
  public.approve_print_order_master(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_print_master(uuid,uuid), public.complete_print_master(uuid,uuid,text,jsonb,text),
  public.approve_print_order_master(uuid,uuid,uuid) to service_role;

-- A paid order remains paid while preparation is pending. Guard operational
-- shipping changes, including direct admin SQL/client writes.
create function public.guard_print_order_shipping() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status::text in ('SHIPPED','DELIVERED')
    and exists (select 1 from print_order_preparations where order_id=new.id and state<>'READY')
  then raise exception 'print_preparation_pending'; end if;
  return new;
end $$;
create trigger guard_print_order_shipping before update of status on public.orders
for each row execute function public.guard_print_order_shipping();

-- Preserve both payment transactions and their existing idempotency/stock
-- semantics. The only new input is the revision selected at checkout.
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
     print_variant_id,print_size_snapshot,print_finish_snapshot,product_type_snapshot,print_image_url_snapshot,print_asset_revision_id,print_framing_snapshot)
   values(oid,a.id,title,case when it->>'type'='PRINT' then coalesce(nullif(it->>'sku',''),a.sku) else a.sku end,(it->>'unit_amount')::numeric,(it->>'quantity')::integer,token,
     case when it->>'type'='PRINT' then (select v.id from artwork_prints v where v.id=nullif(it->>'variant_id','')::uuid and v.artwork_id=a.id) else null end,
     case when it->>'type'='PRINT' then it->>'size' else null end,
     case when it->>'type'='PRINT' then it->>'finish' else null end,
     case when it->>'type'='PRINT' then 'PRINT' else 'ORIGINAL' end,
     case when it->>'type'='PRINT' then nullif(it->>'image_url','') else null end,
     case when it->>'type'='PRINT' then nullif(it->>'revision_id','')::uuid else null end,
     case when it->>'type'='PRINT' then nullif(it->>'framing','') else null end);
 end loop;
 perform complete_order_originals(oid);
 if _promo is not null then update welcome_promotions set status='REDEEMED',redeemed_at=now(),stripe_session_id=_session where id=_promo and status='CLAIMED';end if;
 return oid;
end $fulfill$;


do $migration$
begin
  if to_regclass('public.guest_open_print_checkouts') is not null then
    execute $guest_function$
create or replace function public.fulfill_guest_open_print_checkout(
 _checkout uuid,_session text,_intent text,_email text,_name text,_phone text,
 _shipping jsonb,_total_mxn numeric,_charged_currency text,_charged_amount numeric,_fx numeric
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c public.guest_open_print_checkouts%rowtype;existing uuid;neworder uuid;item jsonb;
  sum_mxn numeric:=0; a public.artworks%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(_session,0));
 select * into c from public.guest_open_print_checkouts where id=_checkout for update;
 if not found or c.stripe_session_id is distinct from _session then raise exception 'print_checkout_session_mismatch';end if;
 if c.order_id is not null then return jsonb_build_object('order_id',c.order_id,'existing',true);end if;
 select id into existing from public.orders where stripe_session_id=_session;
 if existing is not null then raise exception 'print_checkout_order_already_exists';end if;
 if nullif(trim(_email),'') is null or _total_mxn <= 0 or
    _charged_currency not in ('MXN','USD') or _charged_amount <= 0 or
    (_charged_currency='USD' and coalesce(_fx,0)<=0) then raise exception 'invalid_print_payment';end if;
 if jsonb_array_length(c.items) not between 1 and 20 then raise exception 'invalid_print_items';end if;
 perform set_config('jbu.guest_open_print_fulfillment','authorized',true);
 for item in select value from jsonb_array_elements(c.items) loop
   if (item->>'quantity')::integer not between 1 and 100 or
      (item->>'unit_mxn')::numeric <= 0 or
      nullif(item->>'variant_id','') is null or
      nullif(item->>'artwork_id','') is null then raise exception 'invalid_print_snapshot';end if;
   select * into a from public.artworks where id=(item->>'artwork_id')::uuid for share;
   if not found then raise exception 'print_artwork_missing';end if;
   -- Print may have been deactivated/deleted AFTER the buyer paid.
   -- The locked checkout snapshot is authoritative; verify a surviving row
   -- if present, but do not reject a genuinely paid order due to later deletion.
   if exists(select 1 from public.artwork_prints v
      where v.id=(item->>'variant_id')::uuid
        and (v.artwork_id<>a.id or v.edition_type::text<>'OPEN'))
   then raise exception 'print_variant_mismatch';end if;
   sum_mxn:=sum_mxn+(item->>'unit_mxn')::numeric*(item->>'quantity')::integer;
 end loop;
 -- Discount reconciliation must use the final Stripe-paid price, which may
 -- be lower than the catalogue total if coupons are enabled in a later phase.
 if round(sum_mxn,2) is distinct from round(_total_mxn,2) then raise exception 'print_total_mismatch';end if;
 insert into public.orders
   (stripe_session_id,stripe_payment_intent_id,buyer_user_id,buyer_email,buyer_name,
    buyer_phone,shipping_address,total_amount_mxn,status,payment_method,payment_status,
    paid_at,charged_currency,charged_amount,fx_usd_per_mxn,production_status,order_origin)
 values(_session,_intent,c.buyer_user_id,_email,coalesce(_name,'Guest'),_phone,
    coalesce(_shipping,'{}'::jsonb),_total_mxn,'PAYMENT_RECEIVED','stripe','PAID',
    now(),_charged_currency,_charged_amount,_fx,'PENDING','OPEN_PRINT')
 returning id into neworder;
 for item in select value from jsonb_array_elements(c.items) loop
   insert into public.order_items
     (order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity,
      claim_token_snapshot,print_variant_id,print_size_snapshot,print_finish_snapshot,product_type_snapshot,print_image_url_snapshot,print_asset_revision_id,print_framing_snapshot)
   values(neworder,(item->>'artwork_id')::uuid,
     item->>'title',item->>'sku',(item->>'unit_mxn')::numeric,(item->>'quantity')::integer,
     null,
     (select v.id from public.artwork_prints v where v.id=(item->>'variant_id')::uuid),
     item->>'size',item->>'finish','OPEN_PRINT',nullif(item->>'image_url',''),nullif(item->>'revision_id','')::uuid,nullif(item->>'framing',''));
 end loop;
 update public.guest_open_print_checkouts
    set order_id=neworder,fulfilled_at=now(),fulfillment_last_error=null,fulfillment_failed_at=null
  where id=c.id;
 return jsonb_build_object('order_id',neworder,'existing',false);
end $$;
$guest_function$;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
commit;
