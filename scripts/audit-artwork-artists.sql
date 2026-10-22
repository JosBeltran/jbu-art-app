-- SOLO LECTURA. Puede ejecutarse antes de la nueva migración.
-- 1. Confirmar columnas y relaciones existentes: no asumir que autor = propietario.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name in ('artworks','profiles','user_roles')
order by table_name, ordinal_position;
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.artworks'::regclass and contype = 'f';

-- 2. Identidad candidata: comparar nombre y cuenta existente en privado.
-- Una coincidencia de nombre NO basta para autorizar una asociación masiva.
select p.id, p.full_name, u.email,
       lower(btrim(p.full_name)) = lower('Josué Beltrán Uresti') as exact_name
from public.profiles p left join auth.users u on u.id = p.id
where p.full_name ilike '%beltr%' or p.full_name ilike '%josu%'
order by p.full_name, p.id;

-- 3. Evidencia de autoría legacy, sin exigir columnas que podrían no existir.
-- Campos faltantes en to_jsonb quedan null. Nunca usa current_owner_id como autor.
select a.id, a.sku, a.title,
       to_jsonb(a)->>'artist_profile_id' as artist_profile_id,
       to_jsonb(a)->>'artist_id' as legacy_artist_id,
       to_jsonb(a)->>'creator_id' as legacy_creator_id,
       to_jsonb(a)->>'artist' as legacy_artist_label
from public.artworks a order by a.sku;

-- 4. Totales de revisión; "sin evidencia" NO equivale a "obras de Josué".
select count(*) as artworks_total,
 count(*) filter (where to_jsonb(a)->>'artist_profile_id' is not null) as linked_artist,
 count(*) filter (where coalesce(to_jsonb(a)->>'artist_profile_id',
   to_jsonb(a)->>'artist_id', to_jsonb(a)->>'creator_id',
   nullif(btrim(to_jsonb(a)->>'artist'),'')) is null) as without_author_evidence
from public.artworks a;

-- 5. Conteo conservador por perfil candidato: solo evidencia explícita.
-- Revisar semántica de artist_id/creator_id antes de considerarlos equivalentes.
select p.id, p.full_name,
 count(*) filter (where to_jsonb(a)->>'artist_profile_id' = p.id::text) as already_linked,
 count(*) filter (where to_jsonb(a)->>'artist_profile_id' is null
   and (to_jsonb(a)->>'artist_id' = p.id::text
     or to_jsonb(a)->>'creator_id' = p.id::text
     or lower(btrim(to_jsonb(a)->>'artist')) = lower(btrim(p.full_name)))
   and (to_jsonb(a)->>'artist_id' is null or to_jsonb(a)->>'artist_id' = p.id::text)
   and (to_jsonb(a)->>'creator_id' is null or to_jsonb(a)->>'creator_id' = p.id::text)
   and (nullif(btrim(to_jsonb(a)->>'artist'),'') is null
     or lower(btrim(to_jsonb(a)->>'artist')) = lower(btrim(p.full_name)))) as explicit_candidates_to_review
from public.profiles p cross join public.artworks a
where p.full_name ilike '%beltr%' or p.full_name ilike '%josu%'
group by p.id, p.full_name order by p.full_name, p.id;
-- No UPDATE: primero reportar perfil confirmado y lista/conteo de obras autorizadas.