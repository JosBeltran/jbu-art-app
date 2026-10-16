-- 20261022_availability_status.sql
-- Separa la disponibilidad de venta (availability_status) del ciclo de
-- propiedad/certificado (ownership_status) y de la visibilidad de catálogo (status).
-- No renombra ni elimina columnas ni enums existentes.
-- Idempotente: se puede ejecutar más de una vez sin dañar filas vendidas.

-- ============================================================
-- PASO 0 (solo lectura): filas ambiguas que requieren revisión manual.
-- Ejecuta esto ANTES del backfill y guarda el resultado; esas filas NO
-- se vuelven comprables automáticamente (quedan NOT_FOR_SALE → NEEDS REVIEW).
-- ============================================================
-- SELECT id, sku, title, status, ownership_status, current_owner_id
-- FROM public.artworks
-- WHERE upper(coalesce(status::text,'')) = 'OWNED'
--   AND upper(coalesce(ownership_status::text,'')) = 'AVAILABLE'
--   AND current_owner_id IS NOT NULL;

-- Conteo previo (para el reporte "antes"):
-- SELECT ownership_status, count(*) FROM public.artworks GROUP BY ownership_status;

-- ============================================================
-- 1. Enum y columna nuevos
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'availability_status') then
    create type public.availability_status as enum ('AVAILABLE', 'RESERVED', 'SOLD', 'NOT_FOR_SALE');
  end if;
end $$;

alter table public.artworks
  add column if not exists availability_status public.availability_status;

-- ============================================================
-- 2. Backfill (solo filas aún sin valor)
--    AVAILABLE→AVAILABLE, RESERVED→RESERVED,
--    SOLD/CLAIM_PENDING/CLAIMED/VERIFIED→SOLD.
--    Filas ambiguas (OWNED + AVAILABLE + current_owner_id) → NOT_FOR_SALE
--    para que NUNCA reaparezcan como comprables sin revisión humana.
-- ============================================================
update public.artworks
set availability_status = case
  when upper(coalesce(status::text,'')) = 'OWNED'
       and upper(coalesce(ownership_status::text,'')) = 'AVAILABLE'
       and current_owner_id is not null
    then 'NOT_FOR_SALE'::public.availability_status
  when upper(coalesce(ownership_status::text,'')) = 'RESERVED'
    then 'RESERVED'::public.availability_status
  when upper(coalesce(ownership_status::text,'')) in ('SOLD','CLAIM_PENDING','CLAIMED','VERIFIED')
    then 'SOLD'::public.availability_status
  else 'AVAILABLE'::public.availability_status
end
where availability_status is null;

alter table public.artworks
  alter column availability_status set default 'AVAILABLE'::public.availability_status;

update public.artworks set availability_status = 'AVAILABLE'::public.availability_status
where availability_status is null;

alter table public.artworks
  alter column availability_status set not null;

-- ============================================================
-- 3. Limpieza única controlada de reclamos/certificados.
--    Hoy NO hay obras legítimamente reclamadas ni verificadas; las filas
--    históricas en CLAIM_PENDING/CLAIMED/VERIFIED son intentos inválidos.
--    Se normalizan a SOLD y se limpia SOLO el estado de reclamo/certificado.
--    No se toca: status, availability_status, series, pedidos, procedencia,
--    historial de subastas ni precios.
--    Idempotente: si ya está limpia, la fila no cumple el WHERE.
-- ============================================================
update public.artworks
set ownership_status = 'SOLD',
    pending_owner_id = null,
    current_owner_id = null,
    certificate_hash = null,
    certificate_issued_at = null,
    claim_token = null,
    updated_at = now()
where upper(coalesce(ownership_status::text,'')) in ('CLAIM_PENDING','CLAIMED','VERIFIED');

-- Invalida tokens de reclamo sueltos que pertenezcan a intentos anteriores
-- (obras vendidas sin dueño: un token viejo no debe seguir vivo).
update public.artworks
set claim_token = null,
    updated_at = now()
where claim_token is not null
  and upper(coalesce(ownership_status::text,'')) = 'SOLD'
  and current_owner_id is null
  and pending_owner_id is null;

-- ============================================================
-- 4. Guardia permanente: mientras la propiedad esté en ciclo de venta/
--    reclamo/verificación, la disponibilidad no puede salir de SOLD.
--    (Las reclamaciones legítimas posteriores ponen CLAIM_PENDING y la
--    disponibilidad permanece SOLD, que es exactamente lo deseado.)
-- ============================================================
create or replace function public.artworks_availability_guard()
returns trigger
language plpgsql
as $$
begin
  if upper(coalesce(new.ownership_status::text,'')) in ('SOLD','CLAIM_PENDING','CLAIMED','VERIFIED')
     and new.availability_status is distinct from 'SOLD'::public.availability_status then
    new.availability_status := 'SOLD'::public.availability_status;
  end if;
  return new;
end $$;

drop trigger if exists artworks_availability_guard on public.artworks;
create trigger artworks_availability_guard
  before insert or update on public.artworks
  for each row execute function public.artworks_availability_guard();

-- ============================================================
-- 5. Reportes (ejecutar DESPUÉS y pegar el resultado de vuelta):
-- ============================================================
-- a) Conteos por ownership_status previo → verifica con el conteo del PASO 0:
-- SELECT ownership_status, availability_status, count(*)
-- FROM public.artworks GROUP BY ownership_status, availability_status
-- ORDER BY ownership_status, availability_status;
--
-- b) Filas limpiadas por la normalización (deben tener certificado vacío):
-- SELECT ownership_status, count(*) AS limpiadas
-- FROM public.artworks
-- WHERE ownership_status = 'SOLD'
--   AND current_owner_id IS NULL AND pending_owner_id IS NULL
--   AND certificate_hash IS NULL
-- GROUP BY ownership_status;
--
-- c) Obras vendidas históricas listas para reclamación (READY FOR CLAIM):
-- SELECT id, sku, title FROM public.artworks
-- WHERE availability_status = 'SOLD' AND ownership_status = 'SOLD'
--   AND current_owner_id IS NULL AND pending_owner_id IS NULL
-- ORDER BY created_at;
--
-- d) Filas marcadas para revisión manual (NEEDS REVIEW):
-- SELECT id, sku, title, status, ownership_status, current_owner_id
-- FROM public.artworks WHERE availability_status = 'NOT_FOR_SALE';
