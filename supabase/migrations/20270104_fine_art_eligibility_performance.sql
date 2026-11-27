begin;

-- Studio eligibility resolves discovery selections by the published variant.
-- The existing selection identity indexes start with candidate_id.
create index if not exists discovery_selections_product_variant_idx
  on public.product_discovery_selections (product_variant_id);

create or replace function public.public_fine_art_variant_ids(
  _artworks uuid[] default null, _variants uuid[] default null
)
returns table(id uuid) language sql stable set search_path=public as $$
  with candidates as materialized (
    select v.id
    from product_variants v
    join products p on p.id=v.product_id and p.status='published'
    join artwork_products a on a.product_id=p.id and a.is_primary
    where v.status='active'
      and (_artworks is null or a.artwork_id=any(_artworks))
      and (_variants is null or v.id=any(_variants))
  )
  select candidate.id
  from candidates candidate
  where cardinality(fine_art_variant_problems(candidate.id))=0
  order by candidate.id
$$;

commit;
