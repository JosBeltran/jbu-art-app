-- JBU physical-edition checkout core (not yet enabled for customers).
-- Apply only after 20261114. All functions execute only with service_role.
-- No existing UNIQUE, PRINT, local-delivery, auction, or certificate functions are replaced.
begin;

create table if not exists public.physical_edition_checkout_holds (
 id uuid primary key default gen_random_uuid(),
 artwork_id uuid not null references public.artworks(id) on delete restrict,
 unit_id uuid not null references public.artwork_edition_units(id) on delete restrict,
 buyer_user_id uuid not null references auth.users(id) on delete restrict,
 request_key uuid not null unique,
 stripe_session_id text unique,
 stripe_payment_intent_id text,
 quote_mxn numeric(12,2) not null check (quote_mxn>0),
 status text not null default 'HELD' check (status in ('HELD','PAID','EXPIRED','CANCELLED')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 order_id uuid unique references public.orders(id) on delete restrict,
 unique(unit_id,request_key),
 check(status<>'PAID' or (order_id is not null and completed_at is not null))
);
create unique index if not exists physical_edition_one_active_hold_per_unit
 on public.physical_edition_checkout_holds(unit_id) where status='HELD';
create index if not exists physical_edition_holds_buyer_idx
 on public.physical_edition_checkout_holds(buyer_user_id,created_at desc);

alter table public.physical_edition_checkout_holds enable row level security;
revoke all on public.physical_edition_checkout_holds from public,anon,authenticated;
grant all on public.physical_edition_checkout_holds to service_role;

alter table public.order_items
 add column if not exists physical_edition_unit_id uuid unique references public.artwork_edition_units(id) on delete restrict;

-- Existing order-item guard in 20261114 is deliberately replaced with a
-- strict unit-binding validation; the service-only checkout RPC sets the
-- ephemeral GUC while completing the transaction.
create or replace function public.block_unimplemented_physical_edition_sales()
returns trigger language plpgsql set search_path=public as $$
declare edition text;unit_artwork uuid;begin
 if new.artwork_id is null then return new;end if;
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
end $$;

drop trigger if exists block_unimplemented_physical_edition_sales on public.order_items;
create trigger block_unimplemented_physical_edition_sales
 before insert or update of artwork_id,physical_edition_unit_id,claim_token_snapshot
 on public.order_items for each row
 execute function public.block_unimplemented_physical_edition_sales();

-- Never allow an out-of-band order-items insert to claim a limited edition
-- via the old fulfillment function. The only approved path is the new RPC.
-- 20261114 already forbids all limited-edition order-item inserts, including
-- Fine Art Prints attached to such artworks. The final migration must
-- introduce a typed print distinction before restoring print checkout there.

create or replace function public.create_physical_edition_checkout_hold(
 _artwork_id uuid,_buyer uuid,_request_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.artworks%rowtype;u public.artwork_edition_units%rowtype;
 existing public.physical_edition_checkout_holds%rowtype;
 amount numeric;new_hold uuid;begin
 if _artwork_id is null or _buyer is null or _request_key is null then
  raise exception 'invalid_edition_checkout';end if;
 select * into existing from public.physical_edition_checkout_holds where request_key=_request_key for update;
 if found then
  if existing.artwork_id<>_artwork_id or existing.buyer_user_id<>_buyer then raise exception 'request_key_conflict';end if;
  if existing.status='HELD' and existing.expires_at>now() then
   return jsonb_build_object('id',existing.id,'unit_id',existing.unit_id,'amount_mxn',existing.quote_mxn,
     'stripe_session_id',existing.stripe_session_id,'existing',true);end if;
  raise exception 'checkout_request_not_reusable';
 end if;
 if not exists(select 1 from auth.users where id=_buyer and email_confirmed_at is not null)
 then raise exception 'verified_buyer_required';end if;
 -- A single verified buyer cannot lock multiple units in parallel from
 -- the same edition; retries use the same idempotent request key.
 if exists(select 1 from public.physical_edition_checkout_holds
   where artwork_id=_artwork_id and buyer_user_id=_buyer and status='HELD') then
   raise exception 'edition_checkout_already_open';
 end if;
 select * into a from public.artworks where id=_artwork_id for update;
 if not found or a.physical_edition_type<>'LIMITED_EDITION' or
     not a.physical_edition_sales_enabled or a.availability_status::text<>'AVAILABLE' or
     a.status::text<>'AVAILABLE' or coalesce(a.price_display_mode,'SHOW_PRICE')<>'SHOW_PRICE' or
     a.current_owner_id is not null or a.pending_owner_id is not null or
     a.reserved_order_id is not null
 then raise exception 'edition_not_for_sale';end if;
 if exists(select 1 from public.auctions where artwork_id=a.id and
  (status in ('UPCOMING','LIVE') or (status='SOLD' and payment_status='PENDING')))
  or exists(select 1 from public.artwork_offers where artwork_id=a.id and
   status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at>now())
 then raise exception 'edition_has_exclusive_payment';end if;
 amount:=coalesce(nullif(a.base_price_mxn,0),a.calculated_price_mxn,0);
 if amount<=0 then raise exception 'invalid_edition_price';end if;
 select * into u from public.artwork_edition_units
  where artwork_id=_artwork_id and status='AVAILABLE'
  order by edition_number limit 1 for update skip locked;
 if not found then raise exception 'edition_sold_out_or_reserved';end if;
 insert into public.physical_edition_checkout_holds
  (artwork_id,unit_id,buyer_user_id,request_key,quote_mxn,expires_at)
 values(_artwork_id,u.id,_buyer,_request_key,amount,now()+interval '35 minutes')
 returning id into new_hold;
 update public.artwork_edition_units set status='RESERVED',reserved_at=now() where id=u.id;
 return jsonb_build_object('id',new_hold,'unit_id',u.id,'unit_identifier',u.unit_identifier,
  'amount_mxn',amount,'existing',false);
end $$;
revoke all on function public.create_physical_edition_checkout_hold(uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.create_physical_edition_checkout_hold(uuid,uuid,uuid) to service_role;

create or replace function public.bind_physical_edition_checkout_session(_hold uuid,_session text)
returns void language plpgsql security definer set search_path=public as $$
declare h public.physical_edition_checkout_holds%rowtype;begin
 if nullif(trim(_session),'') is null then raise exception 'invalid_stripe_session';end if;
 select * into h from public.physical_edition_checkout_holds where id=_hold for update;
 if not found or h.status<>'HELD' or h.expires_at<=now() then raise exception 'invalid_edition_hold';end if;
 if h.stripe_session_id is not null and h.stripe_session_id<>_session then raise exception 'session_already_bound';end if;
 update public.physical_edition_checkout_holds set stripe_session_id=_session where id=_hold;
end $$;
revoke all on function public.bind_physical_edition_checkout_session(uuid,text) from public,anon,authenticated;
grant execute on function public.bind_physical_edition_checkout_session(uuid,text) to service_role;

-- To be invoked only upon a Stripe-signed checkout.session.expired event,
-- or an explicitly verified checkout cancellation. Never release on a
-- browser cancel URL, since a paid payment may still be pending.
create or replace function public.expire_physical_edition_checkout_hold(_hold uuid,_session text)
returns boolean language plpgsql security definer set search_path=public as $$
declare h public.physical_edition_checkout_holds%rowtype;begin
 select * into h from public.physical_edition_checkout_holds where id=_hold for update;
 if not found then return false;end if;
 if h.stripe_session_id is distinct from _session then raise exception 'edition_session_mismatch';end if;
 if h.status in ('PAID','EXPIRED','CANCELLED') then return false;end if;
 update public.physical_edition_checkout_holds set status='EXPIRED' where id=h.id;
 update public.artwork_edition_units set status='AVAILABLE',reserved_at=null
  where id=h.unit_id and status='RESERVED';
 return true;
end $$;
revoke all on function public.expire_physical_edition_checkout_hold(uuid,text) from public,anon,authenticated;
grant execute on function public.expire_physical_edition_checkout_hold(uuid,text) to service_role;

-- Safe cleanup only before any Stripe session exists, when session creation
-- failed. A session-bound hold may only be released by a verified expiry event.
create or replace function public.cancel_unbound_physical_edition_hold(_hold uuid,_buyer uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare h public.physical_edition_checkout_holds%rowtype;begin
 select * into h from public.physical_edition_checkout_holds where id=_hold for update;
 if not found or h.buyer_user_id is distinct from _buyer or h.status<>'HELD'
   or h.stripe_session_id is not null then return false;end if;
 update public.physical_edition_checkout_holds set status='CANCELLED' where id=h.id;
 update public.artwork_edition_units set status='AVAILABLE',reserved_at=null
  where id=h.unit_id and status='RESERVED';
 return true;
end $$;
revoke all on function public.cancel_unbound_physical_edition_hold(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_unbound_physical_edition_hold(uuid,uuid) to service_role;

-- Paid Stripe session -> one numbered unit -> one order item atomically.
-- No call to complete_order_originals: that legacy function changes
-- artwork-level ownership and would incorrectly sell the whole edition.
create or replace function public.fulfill_physical_edition_checkout(
 _hold uuid,_session text,_intent text,_email text,_name text,
 _phone text,_shipping jsonb,_amount numeric
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare h public.physical_edition_checkout_holds%rowtype;
 u public.artwork_edition_units%rowtype;a public.artworks%rowtype;
 oid uuid;item_id uuid;begin
 if _hold is null or nullif(trim(_session),'') is null or
  nullif(trim(_email),'') is null or _amount is null or _amount<=0 then
  raise exception 'invalid_edition_payment';end if;
 perform pg_advisory_xact_lock(hashtextextended(_session,0));
 select * into h from public.physical_edition_checkout_holds where id=_hold for update;
 if not found or h.stripe_session_id is distinct from _session then
  raise exception 'edition_session_mismatch';end if;
 if h.status='PAID' then
  if h.order_id is null then raise exception 'incomplete_paid_edition_hold';end if;
  return jsonb_build_object('order_id',h.order_id,'unit_id',h.unit_id,'existing',true);end if;
 if h.status<>'HELD' then raise exception 'edition_hold_not_payable';end if;
 -- Stripe can deliver the paid callback slightly after the session deadline.
 -- An unexpired hold is NOT required here: only an actual verified Stripe
 -- expiration releases the unit.
 if round(_amount,2) is distinct from round(h.quote_mxn,2) then raise exception 'edition_amount_mismatch';end if;
 select * into a from public.artworks where id=h.artwork_id for update;
 select * into u from public.artwork_edition_units where id=h.unit_id for update;
 if not found or u.artwork_id<>a.id or u.status<>'RESERVED'
 then raise exception 'edition_unit_not_reserved';end if;
 insert into public.orders
  (stripe_session_id,stripe_payment_intent_id,buyer_user_id,buyer_email,
   buyer_name,buyer_phone,shipping_address,total_amount_mxn,status,
   payment_method,payment_status,paid_at)
 values(_session,_intent,h.buyer_user_id,_email,coalesce(_name,'Collector'),_phone,
    coalesce(_shipping,'{}'::jsonb),h.quote_mxn,'PAYMENT_RECEIVED',
    'stripe','PAID',now())
 returning id into oid;
 perform set_config('jbu.physical_edition_fulfillment','authorized',true);
 insert into public.order_items
  (order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,
   quantity,claim_token_snapshot,physical_edition_unit_id)
 values(oid,a.id,a.title||' (Edition '||u.edition_number||'/'||a.physical_edition_size||')',
   u.unit_identifier,h.quote_mxn,1,null,u.id)
 returning id into item_id;
 update public.artwork_edition_units
  set status='SOLD',order_item_id=item_id,reserved_at=null,sold_at=now()
  where id=u.id;
 update public.physical_edition_checkout_holds
  set status='PAID',order_id=oid,stripe_payment_intent_id=_intent,completed_at=now()
  where id=h.id;
 return jsonb_build_object('order_id',oid,'unit_id',u.id,
  'unit_identifier',u.unit_identifier,'existing',false);
end $$;
revoke all on function public.fulfill_physical_edition_checkout(uuid,text,text,text,text,text,jsonb,numeric)
 from public,anon,authenticated;
grant execute on function public.fulfill_physical_edition_checkout(uuid,text,text,text,text,text,jsonb,numeric)
 to service_role;

commit;
