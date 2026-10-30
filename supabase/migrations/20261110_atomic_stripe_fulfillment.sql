begin;
-- Signed, paid Stripe sessions only; caller supplies actual Stripe line-item totals, not browser prices.
create function public.fulfill_stripe_order(_session text,_intent text,_email text,_name text,_phone text,_shipping jsonb,_amount numeric,_items jsonb,_auction uuid default null,_user uuid default null,_sale_type text default null,_auction_amount numeric default null,_promo uuid default null) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare oid uuid;it jsonb;a artworks%rowtype;ids uuid[];token text;result text;n integer;title text;begin
 if jsonb_typeof(_items) is distinct from 'array' then raise exception 'invalid_items';end if;
 if _session is null or _amount is null or _amount<=0 or nullif(trim(_email),'') is null or jsonb_array_length(_items) not between 1 and 30 then raise exception 'invalid_payment';end if;
 perform pg_advisory_xact_lock(hashtextextended(_session,0));
 select id into oid from orders where stripe_session_id=_session;if oid is not null then return oid;end if;
 select array_agg((v->>'id')::uuid) into ids from jsonb_array_elements(_items) v;
 if (select count(distinct (v->>'id')) from jsonb_array_elements(_items) v)<>jsonb_array_length(_items) then raise exception 'duplicate_item';end if;
 perform 1 from artworks where id=any(ids) order by id for update;
 for it in select value from jsonb_array_elements(_items) loop
 select * into a from artworks where id=(it->>'id')::uuid;
 if not found then raise exception 'artwork_missing';end if;
 if coalesce(it->>'type','ORIGINAL') not in ('ORIGINAL','PRINT') or (it->>'quantity')::integer not between 1 and 100 or (it->>'unit_amount')::numeric<0 or it->>'unit_amount' is null or it->>'quantity' is null then raise exception 'invalid_item';end if;
 if it->>'type'='PRINT' and a.print_type::text='LIMITED' and (a.print_edition_size is null or coalesce(a.prints_sold,0)+(it->>'quantity')::integer>a.print_edition_size) then raise exception 'print_edition_exhausted';end if;
 if coalesce(it->>'type','ORIGINAL')<>'PRINT' and (a.availability_status::text<>'AVAILABLE' or a.reserved_order_id is not null or a.current_owner_id is not null or a.pending_owner_id is not null) then raise exception 'artwork_unavailable';end if;
 end loop;
 if round((select sum((v->>'unit_amount')::numeric*(v->>'quantity')::integer) from jsonb_array_elements(_items) v),2)>round(_amount,2) then raise exception 'amount_mismatch';end if;
 if _auction is not null then
 result:=complete_auction_sale(_auction,_user,_sale_type,_auction_amount,_session);
 if result not in ('OK','ALREADY_PAID') then raise exception 'auction_conflict';end if;end if;
 insert into orders(stripe_session_id,stripe_payment_intent_id,buyer_email,buyer_name,buyer_phone,shipping_address,total_amount_mxn,status,payment_method,payment_status,paid_at) values(_session,_intent,_email,coalesce(_name,'Cliente Galería'),_phone,coalesce(_shipping,'{}'),_amount,'PAYMENT_RECEIVED','stripe','PAID',now()) returning id into oid;
 for it in select value from jsonb_array_elements(_items) loop
 select * into a from artworks where id=(it->>'id')::uuid for update;
 token:=null;title:=a.title;
 if it->>'type'='PRINT' then
 n:=coalesce(a.prints_sold,0)+1;title:=title||case when a.print_type::text='LIMITED' then ' (Print #'||n||' de '||coalesce(a.print_edition_size,0)||')' else ' (Print)' end;
 update artworks set prints_sold=coalesce(prints_sold,0)+(it->>'quantity')::integer,updated_at=now() where id=a.id;
 else token:=upper(encode(gen_random_bytes(8),'hex'));end if;
 insert into order_items(order_id,artwork_id,title_snapshot,sku_snapshot,unit_price_mxn,quantity,claim_token_snapshot) values(oid,a.id,title,a.sku,(it->>'unit_amount')::numeric,(it->>'quantity')::integer,token);
 end loop;
 perform complete_order_originals(oid);
 if _promo is not null then update welcome_promotions set status='REDEEMED',redeemed_at=now(),stripe_session_id=_session where id=_promo and status='CLAIMED';end if;
 return oid;
end $$;
revoke all on function public.fulfill_stripe_order(text,text,text,text,text,jsonb,numeric,jsonb,uuid,uuid,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.fulfill_stripe_order(text,text,text,text,text,jsonb,numeric,jsonb,uuid,uuid,text,numeric,uuid) to service_role;
commit;
