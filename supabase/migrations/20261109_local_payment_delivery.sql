-- Additive extension of audited production orders, items, notifications and site_settings.
-- Requires separately committed 20261108 and existing 20261102/user_roles schema.
begin;
alter table public.site_settings add column if not exists local_delivery jsonb not null default '{"enabled":false,"paymentOnDeliveryEnabled":false,"state":"Nuevo León","municipalities":["Monterrey","San Nicolás de los Garza","Guadalupe","San Pedro Garza García","Santa Catarina","Apodaca","General Escobedo","García","Juárez"],"timezone":"America/Monterrey","businessStart":"10:00","businessEnd":"22:00","standardLeadHours":3,"largeLeadDays":1,"slotMinutes":120}'::jsonb;
alter table public.artworks add column if not exists delivery_category text check(delivery_category in ('standard','large'));
alter table public.orders add column if not exists buyer_user_id uuid references auth.users(id),
 add column if not exists payment_method text not null default 'stripe' check(payment_method in ('stripe','payment_on_delivery')),
 add column if not exists payment_status text not null default 'PAID' check(payment_status in ('PENDING','PAID','CANCELLED')),
 add column if not exists paid_at timestamptz,
 add column if not exists local_delivery_key uuid,
 add column if not exists delivery_category text check(delivery_category in ('standard','large')),
 add column if not exists delivery_start timestamptz, add column if not exists delivery_end timestamptz,
 add column if not exists delivery_timezone text,
 add column if not exists delivery_revision integer not null default 0,
 add column if not exists delivery_locale text not null default 'es' check(delivery_locale in ('es','en')),
 add column if not exists calendar_event_id text, add column if not exists calendar_html_link text,
 add column if not exists calendar_sync_status text not null default 'PENDING' check(calendar_sync_status in ('PENDING','SYNCED','FAILED')),
 add column if not exists calendar_last_synced_at timestamptz, add column if not exists calendar_error text,
 add column if not exists calendar_lease uuid, add column if not exists calendar_lease_until timestamptz;
create unique index if not exists orders_local_delivery_key on public.orders(buyer_user_id,local_delivery_key) where local_delivery_key is not null;
alter table public.artworks add column if not exists reserved_order_id uuid references public.orders(id);
create table public.order_delivery_events(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete cascade,
 event_type text not null,previous_status text,new_status text,changed_by uuid references auth.users(id),
 notes text,created_at timestamptz not null default now(),revision integer not null,
 unique(order_id,revision,event_type)
);
grant select(id,order_id,event_type,previous_status,new_status,created_at,revision) on public.order_delivery_events to authenticated;
grant all on public.order_delivery_events to service_role;
alter table public.order_delivery_events enable row level security;
create policy order_delivery_events_read on public.order_delivery_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and (o.buyer_user_id=auth.uid() or public.is_jbu_admin())));
alter table public.notifications add column if not exists body_es text,add column if not exists body_en text,add column if not exists email_locale text not null default 'es';
grant select(body_es,body_en) on public.notifications to authenticated;
-- Separate roles are the only authority; profile roles and public email allowlists cannot grant privileges.
create or replace function public.is_jbu_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.user_roles where user_id=auth.uid() and role::text='admin')$$;
revoke all on function public.is_jbu_admin() from public,anon;
grant execute on function public.is_jbu_admin() to authenticated,service_role;
drop policy if exists "Permitir actualizar reclamo de obras" on public.artworks;
drop policy if exists "Admins full access on order_items" on public.order_items;
drop policy if exists "Los administradores pueden ver items de las ordenes" on public.order_items;
create policy order_items_separate_admin_read on public.order_items for select to authenticated using(public.is_jbu_admin());
-- Orders and claim items are modified by verified server operations, never direct browser writes.
revoke insert,update,delete,truncate,references,trigger on public.orders,public.order_items from anon,authenticated;
revoke select on public.orders,public.order_items from anon;
grant select on public.orders,public.order_items to authenticated;
grant all on public.orders,public.order_items,public.artworks,public.site_settings to service_role;
create or replace function public.local_delivery_norm(v text) returns text language sql immutable as $$select regexp_replace(lower(trim(translate(coalesce(v,''),'áéíóúüñÁÉÍÓÚÜÑ','aeiouunAEIOUUN'))),'\s+',' ','g')$$;
create or replace function public.local_delivery_municipality(v text) returns text language sql immutable as $$select case local_delivery_norm(v) when 'san nicolas' then 'san nicolas de los garza' when 'san pedro' then 'san pedro garza garcia' when 'escobedo' then 'general escobedo' else local_delivery_norm(v) end$$;
create or replace function public.validate_local_delivery(_address jsonb,_category text,_start timestamptz,_end timestamptz,_enabled boolean default true) returns jsonb language plpgsql security definer set search_path=public as $$
declare c jsonb;z text;d date;b time;e time;mins integer;startlocal timestamp;endlocal timestamp;v text;begin
 select local_delivery into c from site_settings where id=true for share;
 if c is null then raise exception 'delivery_unconfigured';end if;
 if _enabled and (coalesce((c->>'enabled')::boolean,false) is not true or coalesce((c->>'paymentOnDeliveryEnabled')::boolean,false) is not true) then raise exception 'delivery_disabled';end if;
 if local_delivery_norm(_address->>'country')<>'mx' or local_delivery_norm(_address->>'state')<>local_delivery_norm(c->>'state') or not exists(select 1 from jsonb_array_elements_text(c->'municipalities') m where local_delivery_municipality(m)=local_delivery_municipality(coalesce(_address->>'municipality',_address->>'city'))) then raise exception 'address_ineligible';end if;
 foreach v in array array['recipient','phone','street','exterior','neighborhood','postal_code','municipality','state'] loop
 if nullif(trim(_address->>v),'') is null or length(_address->>v)>300 then raise exception 'address_incomplete';end if;end loop;
 if (_address->>'postal_code') !~ '^\d{5}$' or (_address->>'phone') !~ '^\+?[0-9 ()-]{7,30}$' or length(coalesce(_address->>'notes',''))>1000 then raise exception 'address_invalid';end if;
 z:=c->>'timezone';b:=(c->>'businessStart')::time;e:=(c->>'businessEnd')::time;mins:=(c->>'slotMinutes')::integer;
 startlocal:=_start at time zone z;endlocal:=_end at time zone z;d:=startlocal::date;
 if _start is null or _end is null or _category not in ('standard','large') or _category is null then raise exception 'slot_unavailable';end if;
 if _start<=now() or endlocal::date<>d or startlocal::time<b or endlocal::time>e or endlocal-startlocal<>make_interval(mins=>mins) or mod(extract(epoch from (startlocal-(d+b)))::numeric,mins*60)<>0 then raise exception 'slot_unavailable';end if;
 if _category='standard' and _start<now()+make_interval(secs=>((c->>'standardLeadHours')::numeric*3600)::double precision) then raise exception 'slot_unavailable';end if;
 if _category='large' and d<(now() at time zone z)::date+(c->>'largeLeadDays')::integer then raise exception 'slot_unavailable';end if;
 return c;
end $$;
-- Every path, including old Stripe sessions and direct claims, must respect the reservation owner.
create function public.guard_local_artwork_reservation() returns trigger language plpgsql set search_path=public as $$begin
 if old.reserved_order_id is not null and (new.availability_status,new.ownership_status,new.current_owner_id,new.pending_owner_id,new.claim_token,new.reserved_order_id) is distinct from (old.availability_status,old.ownership_status,old.current_owner_id,old.pending_owner_id,old.claim_token,old.reserved_order_id) and current_setting('jbu.fulfillment_order',true) is distinct from old.reserved_order_id::text then raise exception 'artwork_reserved';end if;
 return new;end $$;
create trigger z_local_reservation_guard before update on public.artworks for each row execute function public.guard_local_artwork_reservation();
-- Shared original-sale core; retains existing claim-first ownership/COA semantics.
create function public.complete_order_originals(_order uuid) returns void language plpgsql security definer set search_path=public,extensions as $$
declare o orders%rowtype;i record;a artworks%rowtype;t text;begin
 select * into o from orders where id=_order for update;if not found then raise exception 'order_not_found';end if;
 if o.payment_status<>'PAID' then raise exception 'payment_pending';end if;
 perform set_config('jbu.fulfillment_order',_order::text,true);
 for i in select * from order_items where order_id=_order and artwork_id is not null and claim_token_snapshot is not null order by artwork_id loop
 select * into a from artworks where id=i.artwork_id for update;
 if a.availability_status::text='SOLD' and a.claim_token=i.claim_token_snapshot then continue;end if;
 if a.current_owner_id is not null or a.pending_owner_id is not null or a.availability_status::text not in ('AVAILABLE','RESERVED') or (a.reserved_order_id is not null and a.reserved_order_id<>_order) then raise exception 'artwork_unavailable';end if;
 if o.payment_method='payment_on_delivery' and a.reserved_order_id is distinct from _order then raise exception 'reservation_lost';end if;
 update artworks set availability_status='SOLD',ownership_status='SOLD',reserved_order_id=null,claim_token=i.claim_token_snapshot,certificate_hash=null,claim_notes='Original comprado por '||o.buyer_email||'. Orden: '||o.id,updated_at=now() where id=a.id;
 end loop;
end $$;
create function public.create_local_delivery_order(_user uuid,_key uuid,_ids uuid[],_address jsonb,_start timestamptz,_end timestamptz,_locale text) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare oid uuid;a artworks%rowtype;category text:='standard';total numeric:=0;c jsonb;email text;begin
 if _key is null or _user is null or _locale not in ('es','en') or _locale is null then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended(_user::text||_key::text,0));
 select id into oid from orders where buyer_user_id=_user and local_delivery_key=_key;if oid is not null then return oid;end if;
 select u.email into email from auth.users u where u.id=_user and u.email_confirmed_at is not null;if email is null then raise exception 'auth_required';end if;
 if _ids is null or cardinality(_ids) not between 1 and 30 or (select count(distinct x) from unnest(_ids) x)<>cardinality(_ids) then raise exception 'invalid_items';end if;
 perform 1 from artworks where id=any(_ids) order by id for update;
 if (select count(*) from artworks where id=any(_ids))<>cardinality(_ids) then raise exception 'artwork_unavailable';end if;
 for a in select * from artworks where id=any(_ids) order by id loop
 if a.availability_status::text<>'AVAILABLE' or a.ownership_status::text not in ('AVAILABLE','NOT_FOR_SALE') or a.reserved_order_id is not null or a.current_owner_id is not null or a.pending_owner_id is not null or a.status::text<>'AVAILABLE' or coalesce(a.price_display_mode,'SHOW_PRICE')<>'SHOW_PRICE' then raise exception 'artwork_unavailable';end if;
 if (a.series_id is not null or exists(select 1 from series s where upper(trim(s.title))=upper(trim(a.series)))) and not exists(select 1 from series s where (s.id=a.series_id or (a.series_id is null and upper(trim(s.title))=upper(trim(a.series)))) and (s.editorial_status='active' or (s.editorial_status='coming_soon' and s.auto_launch and s.launch_date<=now()))) then raise exception 'artwork_unavailable';end if;
 if a.delivery_category is null or a.delivery_category not in ('standard','large') then raise exception 'category_requires_review';end if;
 if a.delivery_category='large' then category:='large';end if;
 if coalesce(nullif(a.base_price_mxn,0),a.calculated_price_mxn,0)<=0 then raise exception 'invalid_amount';end if;
 if exists(select 1 from auctions where artwork_id=a.id and (status in ('UPCOMING','LIVE') or(status='SOLD' and payment_status='PENDING'))) or exists(select 1 from artwork_offers where artwork_id=a.id and status::text='ACCEPTED' and payment_status='PENDING' and payment_due_at>now()) then raise exception 'payment_conflict';end if;
 total:=total+coalesce(nullif(a.base_price_mxn,0),a.calculated_price_mxn);
 end loop;
 c:=validate_local_delivery(_address,category,_start,_end);
 insert into orders(buyer_user_id,local_delivery_key,buyer_email,buyer_name,buyer_phone,shipping_address,total_amount_mxn,status,payment_method,payment_status,delivery_category,delivery_start,delivery_end,delivery_timezone,delivery_revision,delivery_locale)
 values(_user,_key,email,_address->>'recipient',_address->>'phone',_address,total,'PENDING_CONFIRMATION','payment_on_delivery','PENDING',category,_start,_end,c->>'timezone',1,_locale) returning id into oid;
 insert into order_items(order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity) select oid,id,title,sku,coalesce(nullif(base_price_mxn,0),calculated_price_mxn),1 from artworks where id=any(_ids);
 update artworks set availability_status='RESERVED',reserved_order_id=oid,updated_at=now() where id=any(_ids);
 insert into order_delivery_events(order_id,event_type,new_status,changed_by,revision) values(oid,'CREATED','PENDING_CONFIRMATION',_user,1);
 return oid;
end $$;
create function public.update_local_delivery_order(_order uuid,_admin uuid,_action text,_start timestamptz default null,_end timestamptz default null,_notes text default null,_revision integer default null) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare o orders%rowtype;prev text;t text;i record;begin
 if not exists(select 1 from user_roles where user_id=_admin and role::text='admin') then raise exception 'forbidden';end if;
 select * into o from orders where id=_order for update;
 if not found or o.payment_method<>'payment_on_delivery' then raise exception 'order_not_found';end if;
 if _action='DELIVERED' and o.status::text='DELIVERED' then return o.id;end if;
 if _action='CANCELLED' and o.status::text='CANCELLED' then return o.id;end if;
 if _revision is distinct from o.delivery_revision then raise exception 'stale_order';end if;
 if o.status::text in ('DELIVERED','CANCELLED') or o.payment_status<>'PENDING' then raise exception 'order_completed';end if;
 if length(coalesce(_notes,''))>2000 then raise exception 'invalid_notes';end if;
 prev:=o.status::text;
 if _action='CONFIRMED' then
 if o.status::text<>'PENDING_CONFIRMATION' then raise exception 'invalid_transition';end if;
 perform validate_local_delivery(o.shipping_address,o.delivery_category,o.delivery_start,o.delivery_end,false);
 update orders set status='CONFIRMED' where id=o.id;
 elsif _action='SHIPPED' then
 if o.status::text<>'CONFIRMED' then raise exception 'invalid_transition';end if;
 update orders set status='SHIPPED',shipped_at=now() where id=o.id;
 elsif _action='RESCHEDULED' then
 if o.status::text not in ('PENDING_CONFIRMATION','CONFIRMED') then raise exception 'invalid_transition';end if;
 perform validate_local_delivery(o.shipping_address,o.delivery_category,_start,_end,false);
 update orders set delivery_start=_start,delivery_end=_end where id=o.id;
 elsif _action='CANCELLED' then
 perform set_config('jbu.fulfillment_order',o.id::text,true);
 perform 1 from artworks where reserved_order_id=o.id order by id for update;
 update artworks set availability_status='AVAILABLE',reserved_order_id=null,updated_at=now() where reserved_order_id=o.id and availability_status::text='RESERVED' and current_owner_id is null and pending_owner_id is null;
 update orders set status='CANCELLED',payment_status='CANCELLED' where id=o.id;
 elsif _action='DELIVERED' then
 if o.status::text<>'SHIPPED' then raise exception 'invalid_transition';end if;
 -- PAYMENT_RECEIVED invokes the existing XP trigger once, inside the same atomic transaction.
 update orders set status='PAYMENT_RECEIVED',payment_status='PAID',paid_at=now() where id=o.id;
 for i in select id from order_items where order_id=o.id loop
 t:=upper(encode(gen_random_bytes(8),'hex'));update order_items set claim_token_snapshot=t where id=i.id;end loop;
 perform complete_order_originals(o.id);
 update orders set status='DELIVERED',delivered_at=now() where id=o.id;
 else raise exception 'invalid_action';end if;
 update orders set delivery_revision=delivery_revision+1,calendar_sync_status='PENDING',calendar_error=null,updated_at=now() where id=o.id;
 insert into order_delivery_events(order_id,event_type,previous_status,new_status,changed_by,notes,revision) select id,_action,prev,status::text,_admin,_notes,delivery_revision from orders where id=o.id;
 return o.id;
end $$;
-- Local order events reuse the private notification inbox and its leased Resend outbox.
create function public.local_delivery_notification() returns trigger language plpgsql security definer set search_path=public as $$
declare o orders%rowtype;es text;en text;bes text;ben text;k text;u record;begin
 select * into o from orders where id=new.order_id;
 case new.event_type
 when 'CREATED' then es:='Recibimos tu pedido. Tu obra ha sido reservada mientras confirmamos la entrega.';en:='We received your order. Your artwork has been reserved while we confirm delivery.';
 when 'CONFIRMED' then es:='Tu pedido ha sido confirmado.';en:='Your order has been confirmed.';
 when 'SHIPPED' then es:='Tu obra está en camino.';en:='Your artwork is on its way.';
 when 'RESCHEDULED' then es:='Tu horario de entrega fue actualizado.';en:='Your delivery schedule has been updated.';
 when 'DELIVERED' then es:='Tu obra ha sido entregada. Gracias por apoyar mi trabajo.';en:='Your artwork has been delivered. Thank you for supporting my work.';
 when 'CANCELLED' then es:='Tu pedido ha sido cancelado.';en:='Your order has been cancelled.';
 else return new;end case;
 k:='delivery:'||o.id||':'||new.revision||':'||new.event_type;
 bes:=case when o.payment_status='PAID' then 'Pago recibido al entregar.' else 'No se realizó ningún cargo en línea. El pago se realizará al momento de la entrega.' end;
 ben:=case when o.payment_status='PAID' then 'Payment collected upon delivery.' else 'No payment has been collected online. Payment will be completed upon delivery.' end;
 if o.status::text<>'CANCELLED' then
 bes:=bes||' Entrega: '||to_char(o.delivery_start at time zone o.delivery_timezone,'YYYY-MM-DD HH24:MI')||'–'||to_char(o.delivery_end at time zone o.delivery_timezone,'HH24:MI')||' ('||o.delivery_timezone||').';
 ben:=ben||' Delivery: '||to_char(o.delivery_start at time zone o.delivery_timezone,'YYYY-MM-DD HH24:MI')||'–'||to_char(o.delivery_end at time zone o.delivery_timezone,'HH24:MI')||' ('||o.delivery_timezone||').';end if;
 perform enqueue_notification(o.buyer_user_id,o.buyer_email,'LOCAL_'||new.event_type,'ORDER',o.id::text,k,'/orders/'||o.id,es,en);
 update notifications set body_es=bes,body_en=ben,email_locale=o.delivery_locale where event_key=k;
 if new.event_type='CREATED' then
 for u in select ur.user_id,a.email from user_roles ur join auth.users a on a.id=ur.user_id where ur.role::text='admin' loop
 perform enqueue_notification(u.user_id,u.email,'LOCAL_NEW_ORDER','ORDER',o.id::text,k||':admin:'||u.user_id,'/admin/orders','Nueva orden contra entrega','New pay on delivery order');
 update notifications set body_es='Pedido #'||o.id||'. '||o.buyer_name||' · '||o.buyer_phone||'. '||coalesce(o.shipping_address->>'line1','')||', '||coalesce(o.shipping_address->>'city','')||'. Total MXN '||o.total_amount_mxn||'. '||bes,body_en='Order #'||o.id||'. '||o.buyer_name||' · '||o.buyer_phone||'. '||coalesce(o.shipping_address->>'line1','')||', '||coalesce(o.shipping_address->>'city','')||'. Total MXN '||o.total_amount_mxn||'. '||ben where event_key=k||':admin:'||u.user_id;
 end loop;end if;
 return new;
end $$;
create trigger local_delivery_notifications after insert on public.order_delivery_events for each row execute function public.local_delivery_notification();
-- Skip generic online messages for local intermediate PAYMENT_RECEIVED; local events own their accurate wording.
create or replace function public.order_notification_event() returns trigger language plpgsql security definer set search_path=public as $$
declare uid uuid;s text;es text;en text;begin
 if new.payment_method='payment_on_delivery' then return new;end if;
 if tg_op='UPDATE' and new.status is not distinct from old.status then return new;end if;
 select u.id into uid from auth.users u where lower(u.email)=lower(new.buyer_email) and u.email_confirmed_at is not null;
 s:=new.status::text;case s when 'PAYMENT_RECEIVED' then es:='Pago confirmado';en:='Payment confirmed';when 'PROCESSING' then es:='Orden en preparación';en:='Order in preparation';when 'SHIPPED' then es:='Obra enviada';en:='Artwork shipped';when 'DELIVERED' then es:='Obra entregada';en:='Artwork delivered';else return new;end case;
 perform enqueue_notification(uid,null,'ORDER_'||s,'ORDER',new.id::text,'order:'||new.id||':'||s,'/orders/'||new.id,es,en);return new;end $$;
-- Single flight + revision fencing: old sync may finish, but cannot mark a newer appointment synced.
create function public.lease_delivery_calendar(_order uuid,_lease uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare o orders%rowtype;begin
 select * into o from orders where id=_order and payment_method='payment_on_delivery' for update;
 if not found then raise exception 'order_not_found';end if;
 if o.calendar_lease_until>now() then return null;end if;
 update orders set calendar_lease=_lease,calendar_lease_until=now()+interval '5 minutes' where id=o.id;
 return to_jsonb(o);end $$;
create function public.finish_delivery_calendar(_order uuid,_lease uuid,_revision integer,_event text,_link text,_error text) returns boolean language plpgsql security definer set search_path=public as $$declare n integer;begin
 update orders set calendar_event_id=coalesce(_event,calendar_event_id),calendar_html_link=coalesce(_link,calendar_html_link),calendar_sync_status=case when delivery_revision<>_revision then 'PENDING' when _error is null then 'SYNCED' else 'FAILED' end,calendar_error=_error,calendar_last_synced_at=case when _error is null and delivery_revision=_revision then now() else calendar_last_synced_at end,calendar_lease=null,calendar_lease_until=null where id=_order and calendar_lease=_lease;
 get diagnostics n=row_count;return n=1;end $$;
-- Lock active auctions against local reservations, including direct service writes.
create function public.guard_local_auction() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.status in ('UPCOMING','LIVE') then perform 1 from artworks where id=new.artwork_id for update;
 if exists(select 1 from artworks where id=new.artwork_id and reserved_order_id is not null) then raise exception 'artwork_reserved';end if;end if;return new;end $$;
create trigger local_auction_reservation_guard before insert or update on public.auctions for each row execute function public.guard_local_auction();
-- All business functions are server-only. Public normalization helpers carry no authority.
revoke all on function public.validate_local_delivery(jsonb,text,timestamptz,timestamptz,boolean),public.complete_order_originals(uuid),public.create_local_delivery_order(uuid,uuid,uuid[],jsonb,timestamptz,timestamptz,text),public.update_local_delivery_order(uuid,uuid,text,timestamptz,timestamptz,text,integer),public.lease_delivery_calendar(uuid,uuid),public.finish_delivery_calendar(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.validate_local_delivery(jsonb,text,timestamptz,timestamptz,boolean),public.complete_order_originals(uuid),public.create_local_delivery_order(uuid,uuid,uuid[],jsonb,timestamptz,timestamptz,text),public.update_local_delivery_order(uuid,uuid,text,timestamptz,timestamptz,text,integer),public.lease_delivery_calendar(uuid,uuid),public.finish_delivery_calendar(uuid,uuid,integer,text,text,text) to service_role;
commit;
