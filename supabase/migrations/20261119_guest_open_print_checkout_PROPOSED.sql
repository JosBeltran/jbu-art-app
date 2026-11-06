-- PROPOSAL ONLY. Do not execute against production until the order schema audit
-- confirms FK nullability, triggers, and RLS compatibility.
begin;

create table if not exists public.guest_open_print_checkouts (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  buyer_user_id uuid null references auth.users(id),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  token_hash text not null unique,
  order_id uuid unique references public.orders(id),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  email_state text not null default 'PENDING' check (email_state in ('PENDING','SENDING','SENT')),
  email_lease_until timestamptz,
  email_sent_at timestamptz,
  email_last_error text,
  fulfillment_last_error text,
  fulfillment_failed_at timestamptz
);
alter table public.guest_open_print_checkouts enable row level security;
revoke all on public.guest_open_print_checkouts from public,anon,authenticated;
grant all on public.guest_open_print_checkouts to service_role;

alter table public.orders alter column buyer_user_id drop not null;
alter table public.orders add column if not exists production_status text not null default 'PENDING';

alter table public.order_items add column if not exists print_variant_id uuid;
alter table public.order_items add column if not exists print_size_snapshot text;
alter table public.order_items add column if not exists print_finish_snapshot text;
alter table public.order_items add column if not exists product_type_snapshot text;

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
    paid_at,charged_currency,charged_amount,fx_usd_per_mxn,production_status)
 values(_session,_intent,c.buyer_user_id,_email,coalesce(_name,'Guest'),_phone,
    coalesce(_shipping,'{}'::jsonb),_total_mxn,'PAYMENT_RECEIVED','stripe','PAID',
    now(),_charged_currency,_charged_amount,_fx,'PENDING')
 returning id into neworder;
 for item in select value from jsonb_array_elements(c.items) loop
   insert into public.order_items
     (order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity,
      claim_token_snapshot,print_variant_id,print_size_snapshot,print_finish_snapshot,product_type_snapshot)
   values(neworder,(item->>'artwork_id')::uuid,
     item->>'title',item->>'sku',(item->>'unit_mxn')::numeric,(item->>'quantity')::integer,
     null,(item->>'variant_id')::uuid,item->>'size',item->>'finish','OPEN_PRINT');
 end loop;
 update public.guest_open_print_checkouts
    set order_id=neworder,fulfilled_at=now(),fulfillment_last_error=null,fulfillment_failed_at=null
  where id=c.id;
 return jsonb_build_object('order_id',neworder,'existing',false);
end $$;

revoke all on function public.fulfill_guest_open_print_checkout(uuid,text,text,text,text,text,jsonb,numeric,text,numeric,numeric)
 from public,anon,authenticated;
grant execute on function public.fulfill_guest_open_print_checkout(uuid,text,text,text,text,text,jsonb,numeric,text,numeric,numeric)
 to service_role;

commit;
