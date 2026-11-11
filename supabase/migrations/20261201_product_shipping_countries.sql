begin;

-- Originals and numbered physical editions are purchasable at artwork level;
-- Open/Limited print options are independent purchasable variants.
alter table public.artworks add column if not exists allowed_shipping_countries text[];
alter table public.artwork_prints add column if not exists allowed_shipping_countries text[];

create function public.valid_shipping_countries(countries text[]) returns boolean
language sql immutable set search_path = public as $$
  select countries is null or (
    coalesce(array_ndims(countries), 1) = 1
    and array_position(countries, null) is null
    and countries <@ string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW', ' ')
    and cardinality(countries) = (select count(distinct c) from unnest(countries) c)
  )
$$;
alter table public.artworks add constraint artworks_shipping_countries_valid
  check (public.valid_shipping_countries(allowed_shipping_countries));
alter table public.artwork_prints add constraint artwork_prints_shipping_countries_valid
  check (public.valid_shipping_countries(allowed_shipping_countries));
comment on column public.artworks.allowed_shipping_countries is 'ISO 3166-1 alpha-2 destinations for the physical original/numbered edition. NULL or empty is unrestricted. Does not configure shipping rates.';
comment on column public.artwork_prints.allowed_shipping_countries is 'ISO 3166-1 alpha-2 destinations for this purchasable variant. NULL or empty is unrestricted, independent of its parent original.';

create or replace function public.save_admin_artwork_print(_print jsonb, _create boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  p public.artwork_prints := jsonb_populate_record(null::public.artwork_prints, _print);
  v public.artwork_prints;
begin
  perform 1 from public.artworks where id = p.artwork_id for update;
  if not found then raise exception 'artwork_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('artwork_print_save:' || p.id::text, 0));
  select * into v from public.artwork_prints where id = p.id for update;

  if _create then
    if found then
      if to_jsonb(v) @> _print then return to_jsonb(v); end if;
      raise exception 'print_retry_conflict';
    end if;
    insert into public.artwork_prints (
      id, artwork_id, title, title_en, description, description_en, sku, size, finish, paper_type, framing,
      price, currency, edition_type, max_edition_size, sort_order, is_active, image_url,
      print_gallery_image_id, print_provenance_image_id, allowed_shipping_countries
    ) values (
      p.id, p.artwork_id, p.title, p.title_en, p.description, p.description_en, p.sku, p.size, p.finish, p.paper_type, p.framing,
      p.price, p.currency, p.edition_type, p.max_edition_size, p.sort_order, p.is_active, p.image_url,
      p.print_gallery_image_id, p.print_provenance_image_id, p.allowed_shipping_countries
    ) returning * into v;
  else
    if not found then raise exception 'print_not_found'; end if;
    -- Stripe sessions and paid orders may already reference this variant identity.
    if v.artwork_id is distinct from p.artwork_id or v.edition_type is distinct from p.edition_type then
      raise exception 'print_identity_locked';
    end if;
    if p.edition_type::text = 'LIMITED' and (p.max_edition_size < coalesce(v.prints_sold, 0)
       or (p.is_active and p.max_edition_size <= coalesce(v.prints_sold, 0)
           and (v.is_active is not true or p.max_edition_size is distinct from v.max_edition_size))) then
      raise exception 'invalid_print_inventory';
    end if;
    update public.artwork_prints set
      title = p.title, title_en = p.title_en, description = p.description, description_en = p.description_en,
      sku = p.sku, size = p.size, finish = p.finish, paper_type = p.paper_type, framing = p.framing,
      price = p.price, currency = p.currency, max_edition_size = p.max_edition_size, sort_order = p.sort_order,
      is_active = p.is_active, image_url = p.image_url, print_gallery_image_id = p.print_gallery_image_id,
      print_provenance_image_id = p.print_provenance_image_id,
      allowed_shipping_countries = case when _print ? 'allowed_shipping_countries' then p.allowed_shipping_countries else v.allowed_shipping_countries end
    where id = p.id returning * into v;
  end if;

  if v.is_active then
    update public.artworks set allows_prints = true where id = v.artwork_id and allows_prints is distinct from true;
  end if;
  return to_jsonb(v);
end $$;
revoke all on function public.save_admin_artwork_print(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_admin_artwork_print(jsonb, boolean) to service_role;


create or replace function public.create_local_delivery_order(_user uuid,_key uuid,_ids uuid[],_address jsonb,_start timestamptz,_end timestamptz,_locale text) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare oid uuid;a artworks%rowtype;category text:='standard';total numeric:=0;c jsonb;email text;begin
 if _key is null or _user is null or _locale not in ('es','en') or _locale is null then raise exception 'invalid_input';end if;
 perform pg_advisory_xact_lock(hashtextextended(_user::text||_key::text,0));
 select id into oid from orders where buyer_user_id=_user and local_delivery_key=_key;if oid is not null then return oid;end if;
 select u.email into email from auth.users u where u.id=_user and u.email_confirmed_at is not null;if email is null then raise exception 'auth_required';end if;
 if _ids is null or cardinality(_ids) not between 1 and 30 or (select count(distinct x) from unnest(_ids) x)<>cardinality(_ids) then raise exception 'invalid_items';end if;
 perform 1 from artworks where id=any(_ids) order by id for update;
 if (select count(*) from artworks where id=any(_ids))<>cardinality(_ids) then raise exception 'artwork_unavailable';end if;
 for a in select * from artworks where id=any(_ids) order by id loop
 if cardinality(a.allowed_shipping_countries)>0 and not ('MX'=any(a.allowed_shipping_countries)) then raise exception 'shipping_country_conflict';end if;
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

commit;
