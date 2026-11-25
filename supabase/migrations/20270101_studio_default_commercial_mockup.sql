begin;

-- Resolve the existing dynamic composition instead of requiring a second upload
-- of the same mockup. This also covers drafts saved before this migration.
create or replace function public.fine_art_studio_mockups(_variants uuid[])
returns table(variant_id uuid,source_url text) language sql stable set search_path=public as $$
  select distinct v.id,w.source_url
  from product_variants v
  join products p on p.id=v.product_id and p.legacy_source is null
  join wall_art_mockups w on w.variant_id=v.id
  join artwork_products rel on rel.product_id=p.id and rel.is_primary
  join artworks a on a.id=rel.artwork_id
  join product_discovery_selections chosen on chosen.product_variant_id=v.id
  join product_discovery_candidates c on c.id=chosen.candidate_id
  join product_discovery_sessions s on s.id=c.session_id and s.artwork_id=a.id
  left join artwork_prints source on source.id=v.artwork_print_id and source.artwork_id=a.id
  where v.id=any(_variants) and p.family_code in ('fine_art_print','framed_print','canvas','acrylic','merchandise')
    -- An explicitly selected gallery primary keeps its own verification rules.
    and not exists(select 1 from product_variant_assets g where g.variant_id=v.id and g.role='gallery' and g.is_primary)
    and w.width_mm>0 and w.height_mm>0 and w.fit in ('contain','cover')
    and w.border_mm>=0 and w.border_mm*2<least(w.width_mm,w.height_mm)
    and w.primary_scene=any(w.scenes) and w.primary_scene in ('gallery','wall')
    and nullif(btrim(w.source_url),'') is not null
    and (w.source_url ~ '^https://' or w.source_url ~ '^/(assets(-optimized)?|images)/')
    and w.source_url not like '%/print-masters/%'
    and w.source_url not like '%/object/sign/%' and w.source_url not like '%/object/authenticated/%'
    and exists(select 1 from provider_product_mappings m where m.product_variant_id=v.id
      and m.provider_code=c.provider_code and m.external_id=c.external_id and m.external_variant_id=c.external_variant_id
      and m.external_configuration=chosen.configuration)
    and (case when v.artwork_print_id is not null then source.id is not null and (
      w.source_url=source.image_url
      or exists(select 1 from artwork_images i where i.id=source.print_gallery_image_id and i.artwork_id=a.id and i.image_url=w.source_url)
      or exists(select 1 from provenance_event_images_public i where i.id=source.print_provenance_image_id and i.artwork_id=a.id and i.image_url=w.source_url)
      or (source.image_url is null and source.print_gallery_image_id is null and source.print_provenance_image_id is null
        and w.source_url=coalesce(s.criteria#>>'{previewImage,url}',a.primary_image_url)))
    else w.source_url=coalesce(s.criteria#>>'{previewImage,url}',a.primary_image_url) end)
$$;
revoke all on function public.fine_art_studio_mockups(uuid[]) from public,anon,authenticated;
grant execute on function public.fine_art_studio_mockups(uuid[]) to service_role;

-- Preserve every existing production, provider, destination and price check.
alter function public.fine_art_variant_problems(uuid) rename to fine_art_variant_problems_without_studio_default;
revoke all on function public.fine_art_variant_problems_without_studio_default(uuid) from public,anon,authenticated;
create function public.fine_art_variant_problems(_variant uuid)
returns text[] language sql stable set search_path=public as $$
  select case when exists(select 1 from fine_art_studio_mockups(array[_variant]))
    then array_remove(fine_art_variant_problems_without_studio_default(_variant),'image')
    else fine_art_variant_problems_without_studio_default(_variant) end
$$;
revoke all on function public.fine_art_variant_problems(uuid) from public,anon,authenticated;
grant execute on function public.fine_art_variant_problems(uuid) to service_role;
notify pgrst,'reload schema';
commit;
