begin;

create function public.studio_gelato_market_targets(_product uuid, _variants uuid[])
returns table(variant_id uuid, candidate_id uuid, mapping_id uuid, uid text)
language sql stable set search_path=public as $$
  select distinct v.id,c.id,m.id,m.external_variant_id
  from product_variants v
  join products p on p.id=v.product_id and p.status='published' and p.legacy_source is null
  join product_discovery_selections chosen on chosen.product_variant_id=v.id
  join product_discovery_candidates c on c.id=chosen.candidate_id and c.provider_code='gelato'
  join product_discovery_sessions s on s.id=c.session_id and s.state<>'archived'
  join artwork_products rel on rel.product_id=v.product_id and rel.is_primary and rel.artwork_id=s.artwork_id
  join provider_product_mappings m on m.product_variant_id=v.id and m.provider_code=c.provider_code
    and m.external_id=c.external_id and m.external_variant_id=c.external_variant_id
    and m.external_configuration=chosen.configuration and m.validation_status<>'rejected'
  join fulfillment_providers fp on fp.code=m.provider_code and fp.enabled
  where p.id=_product and v.id=any(_variants) and v.status='active'
    and c.compatibility->>'status' is distinct from 'incompatible'
    and (v.artwork_print_id is null or exists(select 1 from artwork_prints ap where ap.id=v.artwork_print_id and ap.artwork_id=s.artwork_id))
$$;

create function public.enable_studio_gelato_market(
  _actor uuid, _product uuid, _variant uuid, _book uuid, _quote uuid, _amount bigint
) returns uuid language plpgsql set search_path=public as $$
declare v product_variants; b price_books; q provider_quotes; entry uuid; destination text;
begin
  if _actor is null or _amount is null or _amount not between 1 and 99999999 then raise exception 'market_price_invalid'; end if;
  perform 1 from products where id=_product and status='published' and legacy_source is null for update;
  if not found then raise exception 'market_variant_unavailable'; end if;
  select * into v from product_variants where id=_variant and product_id=_product and status='active' for update;
  if not found then raise exception 'market_variant_unavailable'; end if;
  select * into b from price_books where id=_book and channel='storefront' and segment is null
    and status in ('draft','active') and country is not null and currency in ('MXN','USD')
    and now() >= coalesce(valid_from,'-infinity') and now() < coalesce(valid_to,'infinity') for update;
  if not found then raise exception 'price_book_unavailable'; end if;
  destination:=b.country;

  if coalesce(cardinality(v.allowed_countries),0)=0 then raise exception 'market_destinations_unspecified'; end if;
  if destination=any(v.allowed_countries) then
    select e.id into entry from price_book_entries e where e.product_variant_id=v.id and e.price_book_id=b.id
      and e.status='active' and e.provider_quote_id=_quote and e.amount_minor=_amount;
    if found then return entry; end if;
    raise exception 'market_already_enabled';
  end if;

  select * into q from provider_quotes where id=_quote and created_by=_actor and country=destination
    and currency=b.currency and expires_at>now() and shipping_minor is not null and manufacturing_minor is not null
    and options->>'kind'='studio_market' and options->>'variantId'=_variant::text;
  if not found or not exists (
    select 1 from studio_gelato_market_targets(_product,array[_variant]) t
    where t.candidate_id=q.candidate_id and t.mapping_id::text=q.options->>'mappingId' and t.uid=q.options->>'uid'
  ) then raise exception 'market_quote_invalid_or_expired'; end if;

  if not exists (
    select 1 from artwork_products rel join artworks_discoverable a on a.id=rel.artwork_id and a.allows_prints is true
    join site_settings s on s.id=true and destination=any(s.global_shipping_countries)
    join shipping_policies sp on sp.active and sp.method<>'QUOTE_REQUIRED' and cardinality(sp.postal_codes)=0
    where rel.product_id=_product and rel.is_primary
      and (coalesce(cardinality(a.allowed_shipping_countries),0)=0 or destination=any(a.allowed_shipping_countries))
      and (cardinality(sp.countries)=0 or destination=any(sp.countries))
      and case when cardinality(a.shipping_policy_ids)>0 then sp.id=any(a.shipping_policy_ids)
        else coalesce(s.default_shipping_policies->'open_print' ? sp.id::text,false) end
  ) then raise exception 'market_shipping_not_configured'; end if;

  -- Reuse an existing undated draft for this variant and book when present.
  select id into entry from price_book_entries where price_book_id=b.id and product_variant_id=v.id
    and status='draft' and valid_from is null and valid_to is null order by created_at,id limit 1 for update;
  if entry is null then
    insert into price_book_entries(price_book_id,product_variant_id,amount_minor,provider_quote_id)
      values(b.id,v.id,_amount,q.id) returning id into entry;
  else
    update price_book_entries set amount_minor=_amount,provider_quote_id=q.id,compare_at_minor=null,
      proposal_assumptions=null,updated_at=now() where id=entry;
  end if;
  perform approve_catalog_price(_actor,entry);
  if b.status='draft' then
    if exists(select 1 from price_book_entries e where e.price_book_id=b.id and e.status='active' and e.id<>entry)
      then raise exception 'market_activate_book_separately'; end if;
    perform activate_catalog_price_book(_actor,b.id);
  end if;

  if exists (
    select 1 from price_book_entries e join price_books competing on competing.id=e.price_book_id
    where e.product_variant_id=v.id and e.id<>entry and e.status='active'
      and e.amount_minor between 1 and 99999999 and competing.status='active'
      and competing.country=destination and competing.currency=b.currency and competing.channel='storefront'
      and competing.segment is null and competing.priority>=b.priority
      and now() >= coalesce(competing.valid_from,'-infinity') and now() < coalesce(competing.valid_to,'infinity')
      and now() >= coalesce(e.valid_from,'-infinity') and now() < coalesce(e.valid_to,'infinity')
  ) then raise exception 'market_price_book_conflict'; end if;

  update product_variants set allowed_countries=array_append(v.allowed_countries,destination),updated_at=now() where id=v.id;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'enable_studio_gelato_market',v.id);
  return entry;
end $$;

revoke all on function public.studio_gelato_market_targets(uuid,uuid[]),
  public.enable_studio_gelato_market(uuid,uuid,uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.studio_gelato_market_targets(uuid,uuid[]),
  public.enable_studio_gelato_market(uuid,uuid,uuid,uuid,uuid,bigint) to service_role;

create or replace function public.fine_art_variant_problems(_variant uuid)
returns text[] language sql stable set search_path=public as $$
  with context as (
    select v.*, exists(
      select 1 from wall_art_mockups w
      join product_discovery_selections chosen on chosen.product_variant_id=w.variant_id
      join product_discovery_candidates c on c.id=chosen.candidate_id
      join product_discovery_sessions s on s.id=c.session_id
      join artwork_products rel on rel.product_id=v.product_id and rel.is_primary and rel.artwork_id=s.artwork_id
      where w.variant_id=v.id
    ) as studio
    from product_variants v join products p on p.id=v.product_id
    where v.id=_variant and p.legacy_source is null
  ), problems as (
    select case when exists(select 1 from fine_art_studio_default_mockups(array[_variant]))
      then array_remove(fine_art_variant_problems_without_studio_default(_variant),'image')
      else fine_art_variant_problems_without_studio_default(_variant) end codes
  )
  select case when coalesce(v.studio,false) then
    array_remove(array_remove(problems.codes,'production_asset'),'provider_mapping') ||
    case when v.fulfillment_type='provider' and not exists(
      select 1 from provider_product_mappings m
      join fulfillment_providers fp on fp.code=m.provider_code and fp.enabled
      join product_discovery_selections chosen on chosen.product_variant_id=m.product_variant_id
        and chosen.configuration=m.external_configuration
      join product_discovery_candidates c on c.id=chosen.candidate_id
        and c.provider_code=m.provider_code and c.external_id=m.external_id and c.external_variant_id=m.external_variant_id
      join product_discovery_sessions s on s.id=c.session_id
      join artwork_products rel on rel.product_id=v.product_id and rel.is_primary and rel.artwork_id=s.artwork_id
      where m.product_variant_id=v.id and m.validation_status<>'rejected'
        and c.compatibility->>'status' is distinct from 'incompatible' and s.state<>'archived'
        and (v.artwork_print_id is null or exists(select 1 from artwork_prints ap where ap.id=v.artwork_print_id and ap.artwork_id=s.artwork_id))
        -- Discovery destinations are commercial evidence, not production approval.
        and coalesce(cardinality(v.allowed_countries),0)>0
        and not exists (
          select 1 from unnest(v.allowed_countries) as market(country)
          where (
            (market.country=any(array(select jsonb_array_elements_text(
              case when jsonb_typeof(s.criteria->'countries')='array' then s.criteria->'countries' else '[]'::jsonb end)))
              and (m.allowed_countries is null or market.country=any(m.allowed_countries)))
            or exists (
              select 1 from price_book_entries e join provider_quotes q on q.id=e.provider_quote_id
              where e.product_variant_id=v.id and q.candidate_id=c.id and q.country=market.country
                and q.options->>'kind'='studio_market' and q.options->>'variantId'=v.id::text
                and q.options->>'mappingId'=m.id::text and q.options->>'uid'=m.external_variant_id
            )
          ) is not true
        )
    ) then array['provider_mapping']::text[] else '{}'::text[] end
  else problems.codes end
  from problems left join context v on true
$$;
notify pgrst,'reload schema';
commit;
