begin;

-- A published Studio mockup uses only the approved artwork version's preview.
-- Output is deliberately limited to public display data; no production files.
create function public.fine_art_studio_mockups(_variants uuid[])
returns setof public.wall_art_mockups language sql stable set search_path=public as $$
select w.*
from wall_art_mockups w
join product_variants v on v.id=w.variant_id
join artwork_products rel on rel.product_id=v.product_id and rel.is_primary
join artworks_discoverable a on a.id=rel.artwork_id
where w.variant_id=any(_variants)
  and w.width_mm>0 and w.height_mm>0
  and (w.source_url like 'https://%' or (left(w.source_url,1)='/' and left(w.source_url,2)<>'//'))
  and exists (
    select 1 from product_discovery_selections chosen
    join product_discovery_candidates c on c.id=chosen.candidate_id
    join product_discovery_sessions s on s.id=c.session_id and s.artwork_id=a.id
    where chosen.product_variant_id=w.variant_id
      and w.source_url=coalesce(nullif(s.criteria#>>'{previewImage,url}',''),a.primary_image_url)
  )
$$;
revoke all on function public.fine_art_studio_mockups(uuid[]) from public,anon,authenticated;
grant execute on function public.fine_art_studio_mockups(uuid[]) to service_role;

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
      and m.asset_type in ('mockup','lifestyle') and nullif(m.public_url,'') is not null) and not exists(select 1 from fine_art_studio_mockups(array[v.id])) then 'image' end,
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

commit;
