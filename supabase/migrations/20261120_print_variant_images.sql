-- JBU print image references: existing media rows are reused, never copied.
-- IMPORTANT: Apply after 20261103_provenance_event_images and guest print checkout foundation.
begin;
alter table public.artwork_images
  add column if not exists is_print_image boolean not null default false;
alter table public.artwork_prints
  add column if not exists print_gallery_image_id uuid references public.artwork_images(id) on delete set null,
  add column if not exists print_provenance_image_id uuid references public.provenance_event_images(id) on delete set null;
do $$ begin
  alter table public.artwork_prints add constraint artwork_prints_one_image_source
    check (print_gallery_image_id is null or print_provenance_image_id is null);
exception when duplicate_object then null; end $$;
create index if not exists artwork_images_print_candidates
  on public.artwork_images (artwork_id, display_order, id) where is_print_image = true and media_type = 'image';
-- Never allow cross-artwork image references, nor a video as a print.
create or replace function public.validate_print_image_reference()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.print_gallery_image_id is not null and not exists (
    select 1 from public.artwork_images i where i.id = new.print_gallery_image_id
      and i.artwork_id = new.artwork_id and coalesce(i.media_type,'image') = 'image'
  ) then raise exception 'invalid_gallery_print_image'; end if;
  if new.print_provenance_image_id is not null and not exists (
    select 1 from public.provenance_event_images i
      join public.provenance_events e on e.id = i.provenance_event_id
    where i.id = new.print_provenance_image_id and i.artwork_id = new.artwork_id
      and e.artwork_id = new.artwork_id and e.visibility = 'PUBLIC'
  ) then raise exception 'invalid_provenance_print_image'; end if;
  return new;
end $$;
drop trigger if exists print_image_reference_valid on public.artwork_prints;
create trigger print_image_reference_valid before insert or update of
  print_gallery_image_id, print_provenance_image_id, artwork_id
on public.artwork_prints for each row execute function public.validate_print_image_reference();
-- Snapshot remains stable even after gallery changes or deletion.
alter table public.order_items add column if not exists print_image_url_snapshot text;
-- Existing guest fulfillment RPC redeclared to add only the immutable image snapshot.
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
      claim_token_snapshot,print_variant_id,print_size_snapshot,print_finish_snapshot,product_type_snapshot,print_image_url_snapshot)
   values(neworder,(item->>'artwork_id')::uuid,
     item->>'title',item->>'sku',(item->>'unit_mxn')::numeric,(item->>'quantity')::integer,
     null,
     (select v.id from public.artwork_prints v where v.id=(item->>'variant_id')::uuid),
     item->>'size',item->>'finish','OPEN_PRINT',nullif(item->>'image_url',''));
 end loop;
 update public.guest_open_print_checkouts
    set order_id=neworder,fulfilled_at=now(),fulfillment_last_error=null,fulfillment_failed_at=null
  where id=c.id;
 return jsonb_build_object('order_id',neworder,'existing',false);
end $$;


commit;
