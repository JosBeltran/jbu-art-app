-- Read-only inventory to select exact product IDs. Membership is not approval.
select ids.product_id, p.title_es, a.title as artwork, a.sku as artwork_sku,
  s.criteria->>'workflow' as workflow, s.id as session_id, p.status, saved.created_at
from public.wall_art_studio_saves saved
join public.product_discovery_sessions s on s.id=saved.session_id
cross join lateral unnest(saved.product_ids) ids(product_id)
left join public.products p on p.id=ids.product_id
left join public.artworks a on a.id=s.artwork_id
where s.criteria->>'workflow'='wall_art'
order by saved.created_at desc, ids.product_id;
