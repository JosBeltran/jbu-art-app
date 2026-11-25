begin;

-- Publication is commercial readiness, not permission to manufacture. Keep the
-- original production checks and mapping enablement/fulfillment guards intact.
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
        and v.allowed_countries <@ array(select jsonb_array_elements_text(
          case when jsonb_typeof(s.criteria->'countries')='array' then s.criteria->'countries' else '[]'::jsonb end))
        and (m.allowed_countries is null or v.allowed_countries <@ m.allowed_countries)
    ) then array['provider_mapping']::text[] else '{}'::text[] end
  else problems.codes end
  from problems left join context v on true
$$;
revoke all on function public.fine_art_variant_problems(uuid) from public,anon,authenticated;
grant execute on function public.fine_art_variant_problems(uuid) to service_role;
-- Allow a later validated master to fill an empty mapping of a published variant.
-- Existing production assignments are never replaced and remain disabled until approved.
create or replace function public.link_studio_print_master(_variant uuid)
returns void language plpgsql set search_path=public as $$
declare master print_asset_generations; asset uuid; artwork uuid; resolution record; target product_variants;
begin
  select * into target from product_variants where id=_variant for update;
  if not found or target.status='archived' then return; end if;
  if exists (select 1 from provider_product_mappings m
    where m.product_variant_id=_variant and (m.enabled or m.production_asset_id is not null)) then return; end if;
  select * into resolution from studio_print_master_resolution(_variant);
  if resolution.status <> 'available' then return; end if;
  select * into master from print_asset_generations where revision_id=resolution.revision_id;
  if not found then return; end if;
  artwork:=master.artwork_id;

  insert into art_assets(artwork_id,storage_bucket,storage_path,asset_type,visibility,width_px,height_px,dpi)
  values(artwork,'print-masters',master.production_file_path,'production_derivative','private',
    (master.layout->>'width')::int,(master.layout->>'height')::int,floor(resolution.effective_dpi))
  on conflict (storage_bucket,storage_path,version) do nothing;
  select id into asset from art_assets where artwork_id=artwork and storage_bucket='print-masters'
    and storage_path=master.production_file_path and asset_type='production_derivative'
    and visibility='private' and processing_status='ready' order by version desc limit 1;
  if asset is null then return; end if;

  insert into product_variant_assets(variant_id,asset_id,role) values(_variant,asset,'production') on conflict do nothing;
  update provider_product_mappings set production_asset_id=asset
  where product_variant_id=_variant and not enabled and production_asset_id is null;
end $$;
notify pgrst,'reload schema';
commit;
