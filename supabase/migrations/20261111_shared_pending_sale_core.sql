begin;
-- Preserve the audited pending purchase authorization, amounts and deadlines; only converge the artwork write.
create or replace function public.finalize_pending_purchase(_source text,_id uuid,_user uuid,_session text,_intent text,_amount numeric,_currency text,_paid_at timestamptz,_name text,_phone text,_shipping jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
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
 perform complete_order_originals(oid);
 return jsonb_build_object('order_id',oid,'artwork_id',aid,'sku',art.sku,'title',art.title,'email',email,'existing',false);
end $$;
revoke all on function public.finalize_pending_purchase(text,uuid,uuid,text,text,numeric,text,timestamptz,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_pending_purchase(text,uuid,uuid,text,text,numeric,text,timestamptz,text,text,jsonb) to service_role;
commit;
