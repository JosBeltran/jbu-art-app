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

-- Audit 2026-11-06: orders.buyer_user_id is already nullable; no ALTER required.
alter table public.orders add column if not exists production_status text not null default 'PENDING';
-- Scope trigger exclusions to Open Edition orders only, preserving all existing products.
alter table public.orders add column if not exists order_origin text not null default 'STANDARD';
alter table public.orders add constraint orders_origin_supported check (order_origin in ('STANDARD','OPEN_PRINT'));

alter table public.order_items add column if not exists print_variant_id uuid references public.artwork_prints(id) on delete set null;
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
      claim_token_snapshot,print_variant_id,print_size_snapshot,print_finish_snapshot,product_type_snapshot)
   values(neworder,(item->>'artwork_id')::uuid,
     item->>'title',item->>'sku',(item->>'unit_mxn')::numeric,(item->>'quantity')::integer,
     null,
     (select v.id from public.artwork_prints v where v.id=(item->>'variant_id')::uuid),
     item->>'size',item->>'finish','OPEN_PRINT');
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


-- Trigger review 2026-11-06: guest print-only orders must not gain XP
-- through matching email addresses or enqueue collector-only notifications.
-- All normal order behavior below is verbatim from the audited trigger bodies.
create or replace function public.award_xp_on_order_success()
returns trigger language plpgsql security definer set search_path to 'public' as $function$1declare earned_xp int:=0;order_total numeric:=0;new_status text:=upper(coalesce(new.status::text,''));
begin
 if new.order_origin = 'OPEN_PRINT' then return new;end if;
 order_total:=coalesce(new.total_amount_mxn,0);
 earned_xp:=floor(order_total);
 if new_status in ('PAYMENT_RECEIVED','PAID','COMPLETED') and new.xp_awarded is not true then
   if earned_xp>0 then
     update public.profiles set xp=coalesce(xp,0)+earned_xp
       where lower(email)=lower(new.buyer_email);
     new.xp_awarded:=true;
   end if;
 end if;
 return new;
end $function$;

create or replace function public.order_notification_event()
returns trigger language plpgsql security definer set search_path to 'public' as $function$1declare uid uuid;s text;es text;en text;
begin
 if new.order_origin='OPEN_PRINT' then return new;end if;
 if new.payment_method='payment_on_delivery' then return new;end if;
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new;end if;
 select u.id into uid from auth.users u where lower(u.email)=lower(new.buyer_email) and u.email_confirmed_at is not null;
 s:=new.status::text;
 case s
 when 'PAYMENT_RECEIVED' then es:='Pago confirmado';en:='Payment confirmed';
 when 'PROCESSING' then es:='Orden en preparación';en:='Order in preparation';
 when 'SHIPPED' then es:='Obra enviada';en:='Artwork shipped';
 when 'DELIVERED' then es:='Obra entregada';en:='Artwork delivered';
 else return new;
 end case;
 perform enqueue_notification(uid,null,'ORDER_'||s,'ORDER',new.id::text,
   'order:'||new.id||':'||s,'/orders/'||new.id,es,en);
 return new;
end $function$;

-- A print of a physical limited-edition artwork is NOT a sale of its
-- numbered physical unit. Keep all original numbered-unit checks intact.
create or replace function public.block_unimplemented_physical_edition_sales()
returns trigger language plpgsql set search_path to 'public' as $function$1declare edition text;unit_artwork uuid;
begin
 if new.artwork_id is null then return new;end if;
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
