-- Auditoria de SOLO LECTURA: PDF persistente de certificados (caso JBU-030 / JBU-033 / JBU-034).
-- No modifica datos ni certificados. Ejecutar en el editor SQL de produccion.

-- 1) Estado de los tres certificados del caso (metadata vs estado esperado)
select c.id, c.certificate_number, c.sku, c.status, c.version, c.claim_source,
       c.owner_id, c.artwork_id, c.issued_at, c.pdf_created_at,
       c.data_hash is not null as has_data_hash,
       c.pdf_hash is not null as has_pdf_hash,
       c.pdf_storage_path,
       case when c.pdf_storage_path is not null and c.pdf_hash is not null then 'READY'
            when c.pdf_storage_path is not null or c.pdf_hash is not null then 'METADATA_INCOMPLETE'
            else 'MISSING' end as pdf_state
from public.certificates c
where c.sku in ('JBU-030', 'JBU-033', 'JBU-034')
order by c.sku, c.version;

-- 2) Archivos reales en el bucket privado "certificates" (prefijo = certificate id)
select o.name as storage_path, o.created_at, (o.metadata->>'size')::bigint as bytes
from storage.objects o
where o.bucket_id = 'certificates'
order by o.name;

-- 3) RPCs de certificados disponibles en produccion (confirma migraciones 20261030/20261101)
select p.proname, pg_get_function_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('attach_certificate_pdf', 'issue_certificate_v2');

-- 4) Panorama general: todos los certificados ISSUED con PDF incompleto
select c.sku, c.certificate_number, c.version, c.claim_source, c.issued_at,
       c.pdf_storage_path is not null as has_path, c.pdf_hash is not null as has_hash
from public.certificates c
where c.status = 'ISSUED' and (c.pdf_storage_path is null or c.pdf_hash is null)
order by c.issued_at;
