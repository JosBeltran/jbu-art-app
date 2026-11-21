begin;

-- Reuse only current, validated masters attached to a Print of this exact artwork.
-- Supplier print areas still require their existing mapping approval.
create function public.link_studio_print_master(_variant uuid)
returns void language plpgsql set search_path=public as $$
declare master print_asset_generations; asset uuid; artwork uuid; mockup wall_art_mockups; target product_variants;
begin
  select * into target from product_variants where id=_variant for update;
  if not found or target.status in ('active','archived') then return; end if;
  select w.* into mockup from wall_art_mockups w where w.variant_id=_variant;
  if mockup.width_mm is null or mockup.height_mm is null then return; end if;
  if exists (select 1 from provider_product_mappings m where m.product_variant_id=_variant and m.enabled) then return; end if;
  select rel.artwork_id into artwork from artwork_products rel
  join product_discovery_selections chosen on chosen.product_variant_id=_variant
  join product_discovery_candidates candidate on candidate.id=chosen.candidate_id
  join product_discovery_sessions session on session.id=candidate.session_id and session.artwork_id=rel.artwork_id
  where rel.product_id=target.product_id and rel.is_primary;
  if artwork is null then return; end if;

  select g.* into master from print_asset_generations g
  join artwork_prints p on p.id=g.print_id and p.artwork_id=g.artwork_id and upper(trim(p.size))=g.size
  where g.artwork_id=artwork and g.is_current and g.production_status='MASTER_READY'
    and nullif(trim(g.production_file_path),'') is not null
    and abs((g.layout->>'paperWidthMm')::numeric-mockup.width_mm)<=1
    and abs((g.layout->>'paperHeightMm')::numeric-mockup.height_mm)<=1
  order by g.effective_dpi desc,g.generated_at desc,g.revision_id
  limit 1;
  if not found then return; end if;

  insert into art_assets(artwork_id,storage_bucket,storage_path,asset_type,visibility,width_px,height_px,dpi)
  values(artwork,'print-masters',master.production_file_path,'production_derivative','private',
    (master.layout->>'width')::int,(master.layout->>'height')::int,master.effective_dpi)
  on conflict (storage_bucket,storage_path,version) do nothing;
  select id into asset from art_assets where artwork_id=artwork and storage_bucket='print-masters'
    and storage_path=master.production_file_path and asset_type='production_derivative'
    and visibility='private' and processing_status='ready' order by version desc limit 1;
  if asset is null then return; end if;

  insert into product_variant_assets(variant_id,asset_id,role) values(_variant,asset,'production') on conflict do nothing;
  update provider_product_mappings set production_asset_id=asset
  where product_variant_id=_variant and not enabled and production_asset_id is distinct from asset;
end $$;
revoke all on function public.link_studio_print_master(uuid) from public,anon,authenticated;
grant execute on function public.link_studio_print_master(uuid) to service_role;

create function public.link_studio_print_master_on_save()
returns trigger language plpgsql set search_path=public as $$
begin
  perform link_studio_print_master(new.variant_id);
  return new;
end $$;
revoke all on function public.link_studio_print_master_on_save() from public,anon,authenticated;
create trigger link_studio_print_master_on_save after insert on public.wall_art_mockups
for each row execute function public.link_studio_print_master_on_save();

create function public.fine_art_priced_countries(_variant uuid)
returns text[] language sql stable set search_path=public as $$
select array(select distinct market.country from (
    select country from (
      select b.country,b.currency,dense_rank() over(partition by b.country,b.currency order by b.priority desc) as rank
      from price_book_entries e join price_books b on b.id=e.price_book_id
      where e.product_variant_id=v.id and e.amount_minor between 1 and 99999999 and e.status='active' and b.status='active'
        and b.channel='storefront' and b.segment is null and b.country=any(v.allowed_countries) and b.currency in ('MXN','USD')
        and (coalesce(cardinality(destinations.allowed_shipping_countries),0)=0 or b.country=any(destinations.allowed_shipping_countries))
        and exists(select 1 from site_settings s join shipping_policies sp on sp.active
          where s.id=true and b.country=any(s.global_shipping_countries)
          and sp.method<>'QUOTE_REQUIRED' and cardinality(sp.postal_codes)=0
          and (cardinality(sp.countries)=0 or b.country=any(sp.countries))
          and case when cardinality(destinations.shipping_policy_ids)>0 then sp.id=any(destinations.shipping_policy_ids)
            else coalesce(s.default_shipping_policies->'open_print' ? sp.id::text,false) end)
        and now() < coalesce(e.valid_to,'infinity') and now() >= coalesce(e.valid_from,'-infinity')
        and now() < coalesce(b.valid_to,'infinity') and now() >= coalesce(b.valid_from,'-infinity')
    ) ranked where rank=1 group by country,currency having count(*)=1
  ) market order by market.country)
from product_variants v join products p on p.id=v.product_id
left join artwork_products rel on rel.product_id=p.id and rel.is_primary
left join artworks_discoverable a on a.id=rel.artwork_id
left join artworks destinations on destinations.id=a.id
where v.id=_variant
$$;
revoke all on function public.fine_art_priced_countries(uuid) from public,anon,authenticated;
grant execute on function public.fine_art_priced_countries(uuid) to service_role;

create or replace function public.fine_art_variant_problems(_variant uuid)
returns text[] language sql stable set search_path=public as $$
select array_remove(array[
  case when a.id is null or a.allows_prints is distinct from true or (a.version_kind='SUCCESSOR' and a.version_published_at is null) then 'artwork' end,
  case when nullif(trim(p.title_es),'') is null or nullif(trim(p.title_en),'') is null
    or nullif(trim(p.description_es),'') is null or nullif(trim(p.description_en),'') is null then 'descriptions' end,
  case when not exists(select 1 from product_variant_attribute_values at where at.variant_id=v.id
    and at.attribute_code='size' and nullif(trim(at.text_value),'') is not null)
    and not exists(select 1 from wall_art_mockups w where w.variant_id=v.id and w.width_mm>0 and w.height_mm>0)
    then 'configuration' end,
  case when v.inventory_policy <> 'made_to_order' or v.fulfillment_type not in ('manual','provider') then 'inventory' end,
  case when coalesce(cardinality(v.allowed_countries),0)=0 then 'destinations' end,
  case when v.replaces_print_id is not null and not exists(select 1 from artwork_prints lp where lp.id=v.replaces_print_id and lp.artwork_id=a.id and lp.edition_type::text='OPEN') then 'legacy_mapping' end,
  case when not exists (select 1 from product_variant_assets g join art_assets m on m.id=g.asset_id
    where g.variant_id=v.id and g.role='gallery' and g.is_primary and g.verified_at is not null and g.configuration_snapshot=fine_art_image_configuration(v.id)
      and m.artwork_id=a.id and m.visibility='public' and m.processing_status='ready'
      and m.asset_type in ('mockup','lifestyle') and nullif(m.public_url,'') is not null) then 'image' end,
  case when not exists(select 1 from product_variant_assets link join art_assets f on f.id=link.asset_id
    where link.variant_id=v.id and link.role='production' and f.artwork_id=a.id and f.visibility='private'
      and f.asset_type='production_derivative' and f.processing_status='ready') then 'production_asset' end,
  case when v.fulfillment_type='provider' and not exists(
    select 1 from provider_product_mappings m join fulfillment_providers s on s.code=m.provider_code and s.enabled
    join product_variant_assets link on link.variant_id=v.id and link.asset_id=m.production_asset_id and link.role='production'
    where m.product_variant_id=v.id and m.enabled and m.validation_status='validated'
      and v.allowed_countries <@ m.allowed_countries) then 'provider_mapping' end,
  case
    when exists (
      select 1 from product_discovery_selections chosen
      join product_discovery_candidates c on c.id=chosen.candidate_id
      join product_discovery_sessions s on s.id=c.session_id
      where chosen.product_variant_id=v.id and s.criteria->'countries'->>0='MX'
    ) and not ('MX'=any(fine_art_priced_countries(v.id))) then 'price_mx'
    when cardinality(fine_art_priced_countries(v.id))=0 then 'price'
  end
],null)
from product_variants v join products p on p.id=v.product_id
left join artwork_products rel on rel.product_id=p.id and rel.is_primary
left join artworks_discoverable a on a.id=rel.artwork_id
left join artworks destinations on destinations.id=a.id
where v.id=_variant
$$;

create or replace function public.transition_fine_art_product(_actor uuid,_product uuid,_action text,_variant uuid default null)
returns void language plpgsql set search_path=public as $$
declare p products; target product_variants; problems text[];
begin
  if _actor is null then raise exception 'actor_required'; end if;
  select * into p from products where id=_product for update;
  if not found or p.legacy_source is not null then raise exception 'publication_transition_invalid'; end if;
  if _action='approve' and p.status='pending_review' then
    update products set status='approved',updated_at=now() where id=_product;
  elsif _action='publish' and p.status in ('approved','unpublished','published') then
    select * into target from product_variants where id=_variant and product_id=p.id for update;
    if not found or target.status='archived' then raise exception 'publication_transition_invalid'; end if;
    perform link_studio_print_master(target.id);
    problems:=fine_art_variant_problems(target.id);
    if problems is null then raise exception 'publication_transition_invalid'; end if;
    if cardinality(problems)>0 then
      raise exception 'publication_requirements_missing' using detail=array_to_json(problems)::text;
    end if;
    update product_variants set status='active',updated_at=now() where id=target.id;
    update products set status='published',updated_at=now() where id=_product;
  elsif _action='unpublish' and p.status='published' then
    update product_variants set status='ready',updated_at=now() where product_id=p.id and status='active'
      and (_variant is null or id=_variant);
    if not exists(select 1 from product_variants where product_id=p.id and status='active') then
      update products set status='unpublished',updated_at=now() where id=p.id;
    end if;
  elsif _action='archive' and p.status in ('draft','approved','unpublished') then
    update product_variants set status='archived',updated_at=now() where product_id=p.id;
    update products set status='archived',updated_at=now() where id=p.id;
  elsif _action='revise' and p.status in ('pending_review','approved','unpublished') then
    update products set status='draft',updated_at=now() where id=p.id;
  else raise exception 'publication_transition_invalid';
  end if;
  insert into product_catalog_audit(actor_id,operation,subject_id) values(_actor,'fine_art_'||_action,coalesce(_variant,_product));
end $$;

commit;
