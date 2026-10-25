-- Requires auctions, artwork_offers, orders/order_items, certificates, availability_status and user_roles.
-- No sale-opportunity or reservation entity. Historical accepted offers stay inactive.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter table public.artwork_offers add column if not exists payment_status text not null default 'NONE' check(payment_status in ('NONE','PENDING','PAID','EXPIRED')),
 add column if not exists payment_window_hours integer not null default 72 check(payment_window_hours between 1 and 720),
 add column if not exists accepted_at timestamptz,add column if not exists payment_due_at timestamptz,add column if not exists paid_at timestamptz,
 add column if not exists stripe_session_id text,add column if not exists stripe_session_expires_at timestamptz;
alter table public.auctions add column if not exists stripe_session_expires_at timestamptz;
alter table public.auctions add column if not exists checkout_attempt_id uuid,add column if not exists checkout_attempt_expires_at timestamptz;
alter table public.artwork_offers add column if not exists checkout_attempt_id uuid,add column if not exists checkout_attempt_expires_at timestamptz;
revoke insert,update,delete on public.artwork_offers from anon,authenticated;
grant all on public.artwork_offers to service_role;
create table public.notifications(
 id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade,
 kind text not null,entity_type text not null,entity_id text not null,event_key text not null unique,
 href text not null check(href like '/%' and href not like '//%'),title_es text not null,title_en text not null,
 created_at timestamptz not null default now(),read_at timestamptz,
 recipient_email text,email_sent_at timestamptz,email_lease_until timestamptz,email_error text,
 check(user_id is not null or recipient_email is not null)
);
grant select(id,user_id,kind,entity_type,entity_id,href,title_es,title_en,created_at,read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy notifications_own on public.notifications for select to authenticated using(user_id=auth.uid());
create index notifications_user_created on public.notifications(user_id,created_at desc);
create function public.enqueue_notification(_user uuid,_email text,_kind text,_type text,_id text,_key text,_path text,_es text,_en text)
returns void language plpgsql security definer set search_path=public as $$ begin
 if _user is null and _email is null then return;end if;
 insert into notifications(user_id,recipient_email,kind,entity_type,entity_id,event_key,href,title_es,title_en)
 values(_user,_email,_kind,_type,_id,_key,_path,_es,_en) on conflict(event_key) do nothing;
end $$;
revoke all on function public.enqueue_notification(uuid,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_notification(uuid,text,text,text,text,text,text,text,text) to service_role;
create function public.mark_notification_read(_id uuid default null) returns integer language plpgsql security definer set search_path=public as $$
declare n integer;begin
 if auth.uid() is null then raise exception 'unauthorized';end if;
 update notifications set read_at=now() where user_id=auth.uid() and read_at is null and (_id is null or id=_id);
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
create function public.claim_notification_emails(_scope text default null) returns setof public.notifications language sql security definer set search_path=public as $$
 update notifications set email_lease_until=now()+interval '5 minutes' where id in(
 select id from notifications where recipient_email is not null and email_sent_at is null and (email_lease_until is null or email_lease_until<now()) and (_scope is null or entity_id=_scope) order by created_at limit 20 for update skip locked) returning *
$$;
revoke all on function public.claim_notification_emails(text) from public,anon,authenticated;
grant execute on function public.claim_notification_emails(text) to service_role;
create function public.link_verified_offers(_user uuid) returns void language plpgsql security definer set search_path=public as $$
declare email text;begin
 select lower(u.email) into email from auth.users u where u.id=_user and u.email_confirmed_at is not null;
 if email is null then return;end if;
 update artwork_offers set user_id=_user where user_id is null and lower(trim(guest_email))=email;
 update notifications set user_id=_user where user_id is null and lower(trim(recipient_email))=email and entity_type='OFFER';
end $$;
revoke all on function public.link_verified_offers(uuid) from public,anon,authenticated;
grant execute on function public.link_verified_offers(uuid) to service_role;
create function public.set_offer_decision(_offer uuid,_status text,_admin uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o artwork_offers%rowtype;art artworks%rowtype;aid uuid;begin
 if not exists(select 1 from user_roles where user_id=_admin and role='admin') then raise exception 'forbidden';end if;
 if _status not in ('PENDING','ACCEPTED','REJECTED') then raise exception 'invalid_status';end if;
 select artwork_id into aid from artwork_offers where id=_offer;if not found then raise exception 'offer_not_found';end if;
 select * into art from artworks where id=aid for update;select * into o from artwork_offers where id=_offer for update;
 if o.payment_status='PAID' then raise exception 'already_paid';end if;
 if o.status::text=_status then
  if _status='ACCEPTED' and o.payment_status='NONE' then raise exception 'historical_offer_requires_review';end if;return to_jsonb(o);
 end if;
 if o.status::text='ACCEPTED' then raise exception 'accepted_offer_locked';end if;
 if _status='ACCEPTED' then
  if o.status::text<>'PENDING' or art.accepts_offers is distinct from true or art.availability_status::text is distinct from 'AVAILABLE' or art.current_owner_id is not null or art.pending_owner_id is not null then raise exception 'artwork_unavailable';end if;
  if o.offer_amount_mxn is null or o.offer_amount_mxn<=0 then raise exception 'invalid_amount';end if;
  if exists(select 1 from auctions where artwork_id=aid and(status in('UPCOMING','LIVE') or(status='SOLD' and payment_status='PENDING' and payment_due_at>now()))) or exists(select 1 from artwork_offers where artwork_id=aid and id<>_offer and status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at>now()) then raise exception 'payment_conflict';end if;
  update artwork_offers set status='ACCEPTED',payment_status='PENDING',accepted_at=now(),payment_due_at=now()+make_interval(hours=>payment_window_hours) where id=_offer returning * into o;
 elsif _status='REJECTED' then update artwork_offers set status='REJECTED' where id=_offer returning * into o;
 else update artwork_offers set status='PENDING' where id=_offer returning * into o;end if;
 return to_jsonb(o);
end $$;
revoke all on function public.set_offer_decision(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.set_offer_decision(uuid,text,uuid) to service_role;
create function public.guard_accepted_offer() returns trigger language plpgsql as $$ begin
 if old.status::text='ACCEPTED' and(new.offer_amount_mxn,new.artwork_id,new.guest_email,new.payment_due_at,new.payment_window_hours,new.status) is distinct from(old.offer_amount_mxn,old.artwork_id,old.guest_email,old.payment_due_at,old.payment_window_hours,old.status) then raise exception 'accepted_offer_locked';end if;
 if old.user_id is not null and new.user_id is distinct from old.user_id then raise exception 'offer_buyer_locked';end if;
 return new;end $$;
create trigger artwork_offers_payment_guard before update on public.artwork_offers for each row execute function public.guard_accepted_offer();
create function public.guard_auction_offer() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.status in('LIVE','UPCOMING') then
 perform 1 from artworks where id=new.artwork_id for update;
 if exists(select 1 from artwork_offers where artwork_id=new.artwork_id and status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at>now()) then raise exception 'offer_payment_pending';end if;end if;return new;
end $$;
create trigger auctions_offer_guard before insert or update of status,artwork_id on public.auctions for each row execute function public.guard_auction_offer();
create function public.register_pending_checkout(_source text,_id uuid,_user uuid,_session text,_expires timestamptz,_previous text) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;begin
 if _source='OFFER' then update artwork_offers set stripe_session_id=_session,stripe_session_expires_at=_expires where id=_id and user_id=_user and status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at>now() and stripe_session_id is not distinct from _previous;
 elsif _source='AUCTION' then update auctions set stripe_session_id=_session,stripe_session_expires_at=_expires where id=_id and winner_id=_user and status='SOLD' and sale_type='BID' and payment_status='PENDING' and payment_due_at>now() and stripe_session_id is not distinct from _previous;
 else return false;end if;get diagnostics n=row_count;return n=1;end $$;
revoke all on function public.register_pending_checkout(text,uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.register_pending_checkout(text,uuid,uuid,text,timestamptz,text) to service_role;
-- Persist fixed Stripe parameters before the external call, so retries recover one session.
create function public.prepare_pending_checkout(_source text,_id uuid,_user uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare attempt uuid;expires timestamptz;due timestamptz;buyer uuid;state text;begin
 if _source='OFFER' then
 select checkout_attempt_id,checkout_attempt_expires_at,payment_due_at,user_id,payment_status into attempt,expires,due,buyer,state from artwork_offers where id=_id and status::text='ACCEPTED' for update;
 elsif _source='AUCTION' then
 select checkout_attempt_id,checkout_attempt_expires_at,payment_due_at,winner_id,payment_status into attempt,expires,due,buyer,state from auctions where id=_id and status='SOLD' and sale_type='BID' for update;
 else raise exception 'invalid_source';end if;
 if buyer is distinct from _user or state is distinct from 'PENDING' or due is null or due<=now() then raise exception 'payment_unavailable';end if;
 if attempt is null or expires<=now()+interval '30 minutes' then
  if due<=now()+interval '30 minutes 5 seconds' then raise exception 'insufficient_checkout_time';end if;
  attempt:=gen_random_uuid();expires:=least(due,date_trunc('second',now())+interval '23 hours 59 minutes');
  if _source='OFFER' then update artwork_offers set checkout_attempt_id=attempt,checkout_attempt_expires_at=expires where id=_id;
  else update auctions set checkout_attempt_id=attempt,checkout_attempt_expires_at=expires where id=_id;end if;
 end if;
 return jsonb_build_object('id',attempt,'expires_at',floor(extract(epoch from expires)));
end $$;
revoke all on function public.prepare_pending_checkout(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_pending_checkout(text,uuid,uuid) to service_role;
-- Atomic extension of existing winner fulfillment: same orders/items/states for both origins.
create function public.finalize_pending_purchase(_source text,_id uuid,_user uuid,_session text,_intent text,_amount numeric,_currency text,_paid_at timestamptz,_name text,_phone text,_shipping jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare aid uuid;art artworks%rowtype;o artwork_offers%rowtype;a auctions%rowtype;oid uuid;email text;due timestamptz;amount numeric;buyer uuid;bound text;paid text;token text;begin
 if _source='OFFER' then select artwork_id into aid from artwork_offers where id=_id;
 elsif _source='AUCTION' then select artwork_id into aid from auctions where id=_id;else raise exception 'invalid_source';end if;
 if aid is null then raise exception 'source_not_found';end if;
 select * into art from artworks where id=aid for update;
 if _source='OFFER' then
  select * into o from artwork_offers where id=_id for update;
  if o.status::text<>'ACCEPTED' then raise exception 'not_accepted';end if;
  buyer:=o.user_id;amount:=o.offer_amount_mxn;due:=o.payment_due_at;bound:=o.stripe_session_id;paid:=o.payment_status;
 else
  select * into a from auctions where id=_id for update;
  if a.status<>'SOLD' or a.sale_type<>'BID' then raise exception 'not_won';end if;
  buyer:=a.winner_id;amount:=coalesce(a.winning_amount,a.current_bid);due:=a.payment_due_at;bound:=a.stripe_session_id;paid:=a.payment_status;
 end if;
 if buyer is distinct from _user or bound is distinct from _session then raise exception 'buyer_session_mismatch';end if;
 if _currency is distinct from 'mxn' or _amount is null or round(_amount,2) is distinct from round(amount,2) then raise exception 'amount_mismatch';end if;
 select id into oid from orders where stripe_session_id=_session;
 if paid='PAID' and oid is not null then return jsonb_build_object('order_id',oid,'artwork_id',aid,'sku',art.sku,'title',art.title,'existing',true);end if;
 if paid not in('PENDING','EXPIRED') or due is null or _paid_at is null or _paid_at>=due then raise exception 'payment_expired';end if;
 if art.availability_status::text is distinct from 'AVAILABLE' or art.current_owner_id is not null or art.pending_owner_id is not null then raise exception 'artwork_unavailable';end if;
 select u.email into email from auth.users u where u.id=_user;if email is null then raise exception 'buyer_missing';end if;
 insert into orders(stripe_session_id,stripe_payment_intent_id,buyer_email,buyer_name,buyer_phone,shipping_address,total_amount_mxn,status) values(_session,_intent,email,coalesce(_name,'Cliente Galería'),_phone,coalesce(_shipping,'{}'),_amount,'PAYMENT_RECEIVED') returning id into oid;
 token:=upper(encode(gen_random_bytes(8),'hex'));
 insert into order_items(order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity,claim_token_snapshot) values(oid,aid,art.title,art.sku,_amount,1,token);
 if _source='OFFER' then update artwork_offers set payment_status='PAID',paid_at=_paid_at where id=_id;
 else update auctions set payment_status='PAID',paid_at=_paid_at where id=_id;end if;
 update artworks set availability_status='SOLD',ownership_status='SOLD',claim_token=token,certificate_hash=null,claim_notes='Original comprado por '||email||'. Orden: '||oid,updated_at=now() where id=aid;
 return jsonb_build_object('order_id',oid,'artwork_id',aid,'sku',art.sku,'title',art.title,'email',email,'existing',false);
end $$;
revoke all on function public.finalize_pending_purchase(text,uuid,uuid,text,text,numeric,text,timestamptz,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_pending_purchase(text,uuid,uuid,text,text,numeric,text,timestamptz,text,text,jsonb) to service_role;
create function public.offer_notification_event() returns trigger language plpgsql security definer set search_path=public as $$
declare path text;email text;begin
 select '/artwork/'||sku into path from artworks where id=new.artwork_id;select u.email into email from auth.users u where u.id=new.user_id;email:=coalesce(email,new.guest_email);
 if tg_op='INSERT' then perform enqueue_notification(new.user_id,null,'OFFER_CREATED','OFFER',new.id::text,'offer:'||new.id||':created',path,'Oferta realizada','Offer submitted');
 elsif new.status is distinct from old.status then
 if new.status::text='ACCEPTED' then
 perform enqueue_notification(new.user_id,email,'OFFER_ACCEPTED','OFFER',new.id::text,'offer:'||new.id||':accepted',path,'Tu oferta fue aceptada. Crea tu cuenta gratuita o inicia sesión para completar la compra.','Your offer was accepted. Create your free account or sign in to complete the purchase.');
 perform enqueue_notification(new.user_id,null,'PAYMENT_PENDING','OFFER',new.id::text,'offer:'||new.id||':pending',path,'Pago pendiente','Payment pending');
 elsif new.status::text='REJECTED' then perform enqueue_notification(new.user_id,email,'OFFER_REJECTED','OFFER',new.id::text,'offer:'||new.id||':rejected:'||now(),path,'Oferta rechazada','Offer declined');end if;
 elsif new.payment_status is distinct from old.payment_status then
 if new.payment_status='PAID' then perform enqueue_notification(new.user_id,null,'PURCHASE_COMPLETED','OFFER',new.id::text,'offer:'||new.id||':paid',path,'Compra completada','Purchase completed');
 elsif new.payment_status='EXPIRED' then perform enqueue_notification(new.user_id,null,'PAYMENT_EXPIRED','OFFER',new.id::text,'offer:'||new.id||':expired',path,'El plazo de pago venció','Payment deadline expired');end if;end if;return new;end $$;
create trigger offers_notifications after insert or update on public.artwork_offers for each row execute function public.offer_notification_event();
create function public.auction_notification_event() returns trigger language plpgsql security definer set search_path=public as $$
declare path text;begin
 select '/artwork/'||sku into path from artworks where id=new.artwork_id;
 if new.bid_count>old.bid_count then
 perform enqueue_notification(new.current_bidder_id,null,'BID_PLACED','AUCTION',new.id::text,'auction:'||new.id||':bid:'||new.bid_count,path,'Puja realizada','Bid placed');
 if old.current_bidder_id is not null and old.current_bidder_id is distinct from new.current_bidder_id then perform enqueue_notification(old.current_bidder_id,null,'OUTBID','AUCTION',new.id::text,'auction:'||new.id||':outbid:'||new.bid_count,path,'Tu puja fue superada','You were outbid');end if;end if;
 if new.status='SOLD' and new.sale_type='BID' and old.status<>'SOLD' then
 perform enqueue_notification(new.winner_id,null,'AUCTION_WON','AUCTION',new.id::text,'auction:'||new.id||':won',path,'Ganaste la subasta','You won the auction');
 perform enqueue_notification(new.winner_id,null,'PAYMENT_PENDING','AUCTION',new.id::text,'auction:'||new.id||':pending',path,'Pago pendiente','Payment pending');end if;
 if new.payment_status is distinct from old.payment_status then
 if new.payment_status='PAID' then perform enqueue_notification(new.winner_id,null,'PURCHASE_COMPLETED','AUCTION',new.id::text,'auction:'||new.id||':paid',path,'Compra completada','Purchase completed');
 elsif new.payment_status='EXPIRED' then perform enqueue_notification(new.winner_id,null,'PAYMENT_EXPIRED','AUCTION',new.id::text,'auction:'||new.id||':expired',path,'El plazo de pago venció','Payment deadline expired');end if;end if;return new;end $$;
create trigger auctions_notifications after update on public.auctions for each row execute function public.auction_notification_event();
create function public.refresh_pending_payments() returns void language plpgsql security definer set search_path=public as $$
declare a record;path text;begin
 perform settle_auctions(null);
 update auctions set payment_status='EXPIRED' where status='SOLD' and payment_status='PENDING' and payment_due_at<=now();
 update artwork_offers set payment_status='EXPIRED' where status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at<=now();
 for a in select id,artwork_id,winner_id from auctions where status='SOLD' and payment_status='PENDING' and payment_due_at>now() and payment_due_at<=now()+interval '1 hour' loop
 select '/artwork/'||sku into path from artworks where id=a.artwork_id;
 perform enqueue_notification(a.winner_id,null,'PAYMENT_DUE_SOON','AUCTION',a.id::text,'auction:'||a.id||':due',path,'Tu pago está próximo a vencer','Payment deadline approaching');end loop;
end $$;
revoke all on function public.refresh_pending_payments() from public,anon,authenticated;
grant execute on function public.refresh_pending_payments() to service_role;
create function public.order_notification_event() returns trigger language plpgsql security definer set search_path=public as $$
declare uid uuid;s text;es text;en text;begin
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new;end if;
 select u.id into uid from auth.users u where lower(u.email)=lower(new.buyer_email) and u.email_confirmed_at is not null;
 s:=new.status::text;case s when 'PAYMENT_RECEIVED' then es:='Pago confirmado';en:='Payment confirmed';when 'PROCESSING' then es:='Orden en preparación';en:='Order in preparation';when 'SHIPPED' then es:='Obra enviada';en:='Artwork shipped';when 'DELIVERED' then es:='Obra entregada';en:='Artwork delivered';else return new;end case;
 perform enqueue_notification(uid,null,'ORDER_'||s,'ORDER',new.id::text,'order:'||new.id||':'||s,'/orders/'||new.id,es,en);return new;end $$;
create trigger orders_notifications after insert or update of status on public.orders for each row execute function public.order_notification_event();
create function public.certificate_notification_event() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.status::text='ISSUED' and new.pdf_storage_path is not null and new.pdf_hash is not null then perform enqueue_notification(new.owner_id,null,'COA_AVAILABLE','CERTIFICATE',new.id::text,'certificate:'||new.id||':available','/verify/'||new.sku,'COA disponible','COA available');end if;return new;end $$;
create trigger certificates_notifications after insert or update on public.certificates for each row execute function public.certificate_notification_event();
create function public.ownership_notification_event() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if new.ownership_status::text='VERIFIED' and old.ownership_status::text<>'VERIFIED' then perform enqueue_notification(new.current_owner_id,null,'CERTIFICATE_CLAIMED','ARTWORK',new.id::text,'artwork:'||new.id||':verified:'||new.current_owner_id,'/verify/'||new.sku,'Certificado reclamado','Certificate claimed');end if;
 if old.current_owner_id is not null and new.current_owner_id is not null and new.current_owner_id is distinct from old.current_owner_id then perform enqueue_notification(new.current_owner_id,null,'TRANSFER_COMPLETED','ARTWORK',new.id::text,'artwork:'||new.id||':transfer:'||now(),'/artwork/'||new.sku,'Transferencia completada','Transfer completed');end if;return new;end $$;
create trigger artworks_notifications after update on public.artworks for each row execute function public.ownership_notification_event();
do $$ begin if exists(select 1 from pg_extension where extname='pg_cron') then perform cron.schedule('jbu-pending-payment-expiry','* * * * *','select public.refresh_pending_payments()');end if;end $$;
commit;
