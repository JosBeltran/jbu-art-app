-- Recovery adds no production data reconciliation. Legacy unbound holds stay
-- unresolved: absence of a bound ID is not evidence that Stripe creation failed.
begin;
alter table public.physical_edition_checkout_holds
 add column if not exists recovery_checked_at timestamptz,
 add column if not exists creation_state text check (creation_state in ('READY','STARTED')),
 add column if not exists stripe_create_params jsonb,
 add column if not exists stripe_creation_started_at timestamptz;

-- Persist the exact Stripe request BEFORE sending it. This lock fences safe
-- unbound cancellation against in-flight creation and preserves quote/currency.
create or replace function public.prepare_physical_edition_session(_hold uuid,_buyer uuid,_params jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare h public.physical_edition_checkout_holds%rowtype;begin
 select * into h from public.physical_edition_checkout_holds where id=_hold for update;
 if not found or h.buyer_user_id is distinct from _buyer or h.status<>'HELD'
 then raise exception 'invalid_edition_hold';end if;
 if h.stripe_create_params is not null then return h.stripe_create_params;end if;
 if h.creation_state is distinct from 'READY' or h.expires_at<=now()
 then raise exception 'edition_creation_unresolved';end if;
 if _params->'metadata'->>'physical_edition_hold_id' is distinct from h.id::text
 or _params->'metadata'->>'user_id' is distinct from _buyer::text
 then raise exception 'edition_session_mismatch';end if;
 update public.physical_edition_checkout_holds
 set creation_state='STARTED',stripe_create_params=_params,stripe_creation_started_at=now() where id=h.id;
 return _params;
end $$;
revoke all on function public.prepare_physical_edition_session(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_physical_edition_session(uuid,uuid,jsonb) to service_role;

create or replace function public.create_physical_edition_checkout_hold(
 _artwork_id uuid,_buyer uuid,_request_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.artworks%rowtype;u public.artwork_edition_units%rowtype;
 existing public.physical_edition_checkout_holds%rowtype;
 amount numeric;new_hold uuid;hold_expires timestamptz:=now()+interval '35 minutes';begin
 if _artwork_id is null or _buyer is null or _request_key is null then
  raise exception 'invalid_edition_checkout';end if;
 -- Serialize simultaneous requests from the same buyer for this edition.
 perform pg_advisory_xact_lock(hashtextextended(_artwork_id::text||':'||_buyer::text,0));
 select * into existing from public.physical_edition_checkout_holds where request_key=_request_key for update;
 if found then
  if existing.artwork_id<>_artwork_id or existing.buyer_user_id<>_buyer then raise exception 'request_key_conflict';end if;
  if existing.status='HELD' and existing.expires_at>now() then
   return jsonb_build_object('id',existing.id,'unit_id',existing.unit_id,'amount_mxn',existing.quote_mxn,
     'stripe_session_id',existing.stripe_session_id,'expires_at',existing.expires_at,'existing',true);end if;
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
     not public.physical_edition_is_published(a) or
     not a.physical_edition_sales_enabled or a.availability_status::text is distinct from 'AVAILABLE' or
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
  (artwork_id,unit_id,buyer_user_id,request_key,quote_mxn,expires_at,creation_state)
 values(_artwork_id,u.id,_buyer,_request_key,amount,hold_expires,'READY')
 returning id into new_hold;
 update public.artwork_edition_units set status='RESERVED',reserved_at=now() where id=u.id;
 return jsonb_build_object('id',new_hold,'unit_id',u.id,'unit_identifier',u.unit_identifier,
  'amount_mxn',amount,'expires_at',hold_expires,'existing',false);
end $$;


create or replace function public.bind_physical_edition_checkout_session(_hold uuid,_session text)
returns void language plpgsql security definer set search_path=public as $$
declare h public.physical_edition_checkout_holds%rowtype;begin
 if nullif(trim(_session),'') is null then raise exception 'invalid_stripe_session';end if;
 select * into h from public.physical_edition_checkout_holds where id=_hold for update;
 if not found or h.status<>'HELD' then raise exception 'invalid_edition_hold';end if;
 if h.stripe_session_id is not null and h.stripe_session_id<>_session then raise exception 'session_already_bound';end if;
 update public.physical_edition_checkout_holds set stripe_session_id=_session where id=_hold;
end $$;
revoke all on function public.bind_physical_edition_checkout_session(uuid,text) from public,anon,authenticated;
grant execute on function public.bind_physical_edition_checkout_session(uuid,text) to service_role;


create or replace function public.cancel_unbound_physical_edition_hold(_hold uuid,_buyer uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare h public.physical_edition_checkout_holds%rowtype;begin
 select * into h from public.physical_edition_checkout_holds where id=_hold for update;
 if not found or h.buyer_user_id is distinct from _buyer or h.status<>'HELD'
   or h.stripe_session_id is not null or h.creation_state is distinct from 'READY' then return false;end if;
 update public.physical_edition_checkout_holds set status='CANCELLED' where id=h.id;
 update public.artwork_edition_units set status='AVAILABLE',reserved_at=null
  where id=h.unit_id and status='RESERVED';
 return true;
end $$;
revoke all on function public.cancel_unbound_physical_edition_hold(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_unbound_physical_edition_hold(uuid,uuid) to service_role;


commit;
