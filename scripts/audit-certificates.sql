-- Solo lectura. Ejecutar en el SQL Editor antes y después del backfill.
select count(*) filter (where ownership_status::text = 'VERIFIED') as verified,
       count(*) filter (where ownership_status::text = 'VERIFIED' and certificate_hash is not null and certificate_issued_at is not null) as legacy_valid,
       count(*) filter (where ownership_status::text = 'VERIFIED' and (certificate_hash is null or certificate_issued_at is null)) as verified_incomplete,
       count(*) filter (where ownership_status is null) as null_ownership,
       count(*) filter (where certificate_hash is not null and ownership_status::text <> 'VERIFIED') as hash_not_verified
from public.artworks;
select count(*) as certificates_total,
       count(*) filter (where source = 'LEGACY_BACKFILL') as backfilled,
       count(*) filter (where source = 'APPROVAL') as approved
from public.certificates;
-- Obras VERIFIED sin certificado persistente
select a.id, a.sku, a.certificate_issued_at from public.artworks a
where a.ownership_status::text = 'VERIFIED'
  and not exists (select 1 from public.certificates c where c.artwork_id = a.id and c.status = 'ISSUED');
