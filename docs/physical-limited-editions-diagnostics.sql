-- Read-only commands for an operator with admin read permissions.
begin read only;

select to_regprocedure('public.physical_edition_readiness(uuid)') as readiness,
  to_regprocedure('public.create_physical_edition_checkout_hold(uuid,uuid,uuid)') as checkout,
  to_regprocedure('public.issue_physical_edition_certificate(uuid,uuid,timestamptz,text,jsonb)') as certificate,
  to_regprocedure('public.collector_physical_editions(uuid)') as collection;

select a.sku, a.title, a.status, a.availability_status,
  a.physical_edition_size, a.physical_edition_sales_enabled,
  coalesce(nullif(a.base_price_mxn,0),a.calculated_price_mxn) as price_mxn,
  a.allowed_shipping_countries, a.shipping_policy_ids,
  count(u.id) as registered,
  count(u.id) filter (where u.status='AVAILABLE') as available,
  count(u.id) filter (where u.status='RESERVED') as reserved,
  count(u.id) filter (where u.status='SOLD') as sold
from public.artworks a
left join public.artwork_edition_units u on u.artwork_id=a.id
where a.physical_edition_type='LIMITED_EDITION'
group by a.id
order by a.sku;

rollback;
