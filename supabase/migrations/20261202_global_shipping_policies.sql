begin;
-- Preserve the three existing markets. No expansion and no per-product copying.
alter table public.site_settings add column global_shipping_countries text[] not null default array['MX','CA','US'];
alter table public.site_settings add column default_shipping_policies jsonb not null default '{}'::jsonb;
alter table public.site_settings add column shipping_revision bigint not null default 1;
create function public.valid_checkout_countries(countries text[]) returns boolean
language sql immutable set search_path=public as $$
 select countries is not null and coalesce(array_ndims(countries),1)=1
 and array_position(countries,null) is null and countries <@ string_to_array('AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VN VU WF WS YE YT ZA ZM ZW',' ')
 and cardinality(countries)=(select count(distinct c) from unnest(countries) c)
$$;
alter table public.site_settings add constraint global_shipping_countries_valid check(public.valid_checkout_countries(global_shipping_countries));
create table public.shipping_policies (
 id uuid primary key default gen_random_uuid(), name text not null, name_en text not null, name_es text not null,
 method text not null check(method in ('INCLUDED','FIXED_RATE','LOCAL_DELIVERY','LOCAL_PICKUP','BUYER_ARRANGED','QUOTE_REQUIRED')),
 countries text[] not null default '{}', amount_minor bigint not null check(amount_minor between 0 and 99999999),
 currency text not null default 'MXN' check(currency='MXN'),
 strategy text not null default 'PER_ITEM' check(strategy in ('PER_ITEM','PER_ORDER','PER_PROVIDER')),
 minimum_days integer, maximum_days integer, delivery_unit text not null default 'business_day' check(delivery_unit='business_day'),
 fulfillment_provider text not null check(fulfillment_provider in ('ARTIST','PRODIGI','EXTERNAL','BUYER')),
 insurance_required boolean not null default false, active boolean not null default true,
 postal_codes text[] not null default '{}', instructions_en text not null default '', instructions_es text not null default '', notes text not null default '',
 check(public.valid_checkout_countries(countries)), check(method<>'INCLUDED' or amount_minor=0),
 check((minimum_days is null and maximum_days is null) or (minimum_days is not null and maximum_days is not null and minimum_days between 1 and 365 and maximum_days between minimum_days and 365)),
 check(cardinality(postal_codes)=0 or method='LOCAL_DELIVERY')
);
alter table public.shipping_policies enable row level security;
create policy shipping_policies_admin on public.shipping_policies for all to authenticated using(public.is_jbu_admin()) with check(public.is_jbu_admin());
grant select,insert,update on public.shipping_policies to authenticated;
grant all on public.shipping_policies to service_role;
-- Explicitly preserve the already-included shipping behavior, without invented
-- delivery dates or claiming a supplier integration that does not exist.
insert into public.shipping_policies(id,name,name_en,name_es,method,amount_minor,fulfillment_provider,notes)
 values('00000000-0000-4000-8000-000000000001','Existing included shipping','Shipping included','Envío incluido','INCLUDED',0,'ARTIST','Migration preserves existing Checkout behavior. Review category fulfillment before enabling new markets.');
update public.site_settings set default_shipping_policies=jsonb_build_object(
 'original',jsonb_build_array('00000000-0000-4000-8000-000000000001'),
 'open_print',jsonb_build_array('00000000-0000-4000-8000-000000000001'),
 'limited_print',jsonb_build_array('00000000-0000-4000-8000-000000000001'),
 'physical',jsonb_build_array('00000000-0000-4000-8000-000000000001'), 'supplier','[]'::jsonb
) where id=true;
alter table public.artworks add column shipping_policy_ids uuid[];
alter table public.artwork_prints add column shipping_policy_ids uuid[];

create table public.shipping_checkouts (
 id uuid primary key default gen_random_uuid(), stripe_session_id text unique,
 countries text[] not null check(public.valid_checkout_countries(countries)),
 options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 1 and 5),
 configuration_revision bigint not null, fingerprint text not null,
 selected_snapshot jsonb, created_at timestamptz not null default now()
);
alter table public.shipping_checkouts enable row level security;
revoke all on public.shipping_checkouts from public,anon,authenticated;
grant all on public.shipping_checkouts to service_role;
alter table public.orders add column shipping_snapshot jsonb;
alter table public.orders add column shipping_amount numeric(14,2);
alter table public.orders add column shipping_currency text;
alter table public.orders add column shipping_amount_mxn numeric(14,2);
alter table public.orders add column shipping_method text;
alter table public.orders add column shipping_status text;
alter table public.orders add column shipping_instructions text;
alter table public.orders add column shipping_label_received boolean not null default false;
alter table public.orders add column shipping_arrangement_validated boolean not null default false;

-- Stable server preparation keys retain the same manifest for retried external
-- calls, without allowing a browser to choose a policy, amount or snapshot.
create function public.prepare_shipping_checkout(_id uuid,_countries text[],_options jsonb,_revision bigint,_fingerprint text) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 insert into shipping_checkouts(id,countries,options,configuration_revision,fingerprint) values(_id,_countries,_options,_revision,_fingerprint) on conflict(id) do nothing;
 if not exists(select 1 from shipping_checkouts where id=_id and fingerprint=_fingerprint) then raise exception 'shipping_preparation_conflict';end if;
 return jsonb_build_object('id',_id);
end $$;
revoke all on function public.prepare_shipping_checkout(uuid,text[],jsonb,bigint,text) from public,anon,authenticated;
grant execute on function public.prepare_shipping_checkout(uuid,text[],jsonb,bigint,text) to service_role;

-- Lock the singleton configuration while binding a prepared session so a
-- settings write cannot race a new checkout into an obsolete revision.
create function public.bind_shipping_checkout(_id uuid,_session text) returns boolean language plpgsql security definer set search_path=public as $$
declare revision bigint;c shipping_checkouts%rowtype;
begin
 select shipping_revision into revision from site_settings where id=true for share;
 select * into c from shipping_checkouts where id=_id for update;
 if not found or c.configuration_revision is distinct from revision or (c.stripe_session_id is not null and c.stripe_session_id<>_session) then raise exception 'shipping_configuration_changed';end if;
 update shipping_checkouts set stripe_session_id=_session where id=_id;
 return true;
end $$;
revoke all on function public.bind_shipping_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.bind_shipping_checkout(uuid,text) to service_role;

-- The same INSERT transaction that owns inventory/ownership also freezes shipping.
-- Webhooks pass product-only totals to existing RPCs; this trigger adds the verified
-- shipping amount once. Retries return the existing order and cannot add it twice.
create function public.snapshot_order_shipping() returns trigger language plpgsql security definer set search_path=public as $$
declare c shipping_checkouts%rowtype; s jsonb;
begin
 if new.stripe_session_id is null then return new;end if;
 select * into c from shipping_checkouts where stripe_session_id=new.stripe_session_id for update;
 if not found then return new;end if; -- sessions created before migration
 s:=c.selected_snapshot;
 if s is null then raise exception 'shipping_payment_not_validated';end if;
 if new.shipping_address->>'country' is distinct from s->>'country' then raise exception 'shipping_destination_mismatch';end if;
 new.shipping_snapshot:=s;
 new.shipping_amount:=(s->>'amount')::numeric/100;
 new.shipping_currency:=upper(s->>'currency');
 new.shipping_amount_mxn:=(s->>'amountMxnMinor')::numeric/100;
 new.shipping_method:=s->>'method';
 new.shipping_status:=case when new.shipping_method='BUYER_ARRANGED' then 'AWAITING_SHIPPING_LABEL' when new.shipping_method='LOCAL_PICKUP' then 'READY_FOR_PICKUP' else 'PENDING' end;
 new.shipping_arrangement_validated:=new.shipping_method not in ('BUYER_ARRANGED','LOCAL_PICKUP') and not exists(select 1 from jsonb_array_elements(coalesce(s->'groups','[]')) g where (g->'policy'->>'insurance_required')::boolean is true);
 new.total_amount_mxn:=new.total_amount_mxn+new.shipping_amount_mxn;
 return new;
end $$;
create trigger snapshot_order_shipping before insert on public.orders for each row execute function public.snapshot_order_shipping();
-- A historic paid snapshot is never affected by later policy edits, nor editable
-- through direct Admin table writes. Operational fields remain editable.
create function public.protect_order_shipping() returns trigger language plpgsql as $$
begin
 if old.shipping_snapshot is not null and (new.shipping_snapshot is distinct from old.shipping_snapshot or new.shipping_amount is distinct from old.shipping_amount or new.shipping_currency is distinct from old.shipping_currency or new.shipping_amount_mxn is distinct from old.shipping_amount_mxn or new.shipping_method is distinct from old.shipping_method) then raise exception 'shipping_snapshot_immutable';end if;
 if new.status::text in ('SHIPPED','DELIVERED') and old.shipping_snapshot is not null and (new.payment_status::text<>'PAID' or not new.shipping_arrangement_validated) then raise exception 'shipping_arrangement_not_validated';end if;
 return new;
end $$;
create trigger protect_order_shipping before update on public.orders for each row execute function public.protect_order_shipping();
-- Both policy and settings changes increment a revision used for reusable sessions.
create function public.bump_shipping_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='site_settings' then new.shipping_revision:=old.shipping_revision+1;return new;end if;
 update site_settings set shipping_revision=shipping_revision+1 where id=true;
 return coalesce(new,old);
end $$;
create trigger shipping_settings_revision before update of global_shipping_countries,default_shipping_policies on public.site_settings for each row execute function public.bump_shipping_revision();
create trigger shipping_policy_revision after insert or update or delete on public.shipping_policies for each row execute function public.bump_shipping_revision();

-- Existing local-payment path must also respect a globally disabled Mexico.
create function public.check_local_shipping_destination() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.payment_method='payment_on_delivery' and not exists(select 1 from site_settings where id=true and 'MX'=any(global_shipping_countries)) then raise exception 'shipping_country_conflict';end if;
 return new;
end $$;
create trigger check_local_shipping_destination before insert on public.orders for each row execute function public.check_local_shipping_destination();
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
      print_gallery_image_id, print_provenance_image_id, allowed_shipping_countries, shipping_policy_ids
    ) values (
      p.id, p.artwork_id, p.title, p.title_en, p.description, p.description_en, p.sku, p.size, p.finish, p.paper_type, p.framing,
      p.price, p.currency, p.edition_type, p.max_edition_size, p.sort_order, p.is_active, p.image_url,
      p.print_gallery_image_id, p.print_provenance_image_id, p.allowed_shipping_countries, p.shipping_policy_ids
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
      allowed_shipping_countries = case when _print ? 'allowed_shipping_countries' then p.allowed_shipping_countries else v.allowed_shipping_countries end,
      shipping_policy_ids = case when _print ? 'shipping_policy_ids' then p.shipping_policy_ids else v.shipping_policy_ids end
    where id = p.id returning * into v;
  end if;

  if v.is_active then
    update public.artworks set allows_prints = true where id = v.artwork_id and allows_prints is distinct from true;
  end if;
  return to_jsonb(v);
end $$;
revoke all on function public.save_admin_artwork_print(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_admin_artwork_print(jsonb, boolean) to service_role;



commit;
