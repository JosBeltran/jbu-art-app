-- Fase 2 COA: trazabilidad de origen, colector sin cuenta, PDF persistente y versionado.
-- Aplicar DESPUÉS de 20261028_certificates.sql y 20261029_artwork_artist_profile.sql.
-- Aditiva: no borra filas ni columnas. No toca ventas, órdenes, subastas ni disponibilidad.
begin;

-- 1. Trazabilidad en certificates (source se conserva como campo legacy APPROVAL/LEGACY_BACKFILL).
alter table public.certificates
  add column if not exists claim_source text,
  add column if not exists claim_group_id uuid,
  add column if not exists order_id uuid,
  add column if not exists order_item_id uuid,
  add column if not exists owner_name_snapshot text,
  add column if not exists owner_email_snapshot text,
  add column if not exists previous_certificate_id uuid references public.certificates(id) on delete restrict,
  add column if not exists revision_reason text,
  add column if not exists pdf_created_at timestamptz;

-- Backfill del origen de filas existentes (claim_source aún no es inmutable en este punto).
update public.certificates
   set claim_source = case when source = 'LEGACY_BACKFILL' then 'BACKFILL' else 'DETAIL_CLAIM' end
 where claim_source is null;

create or replace function public.certificates_default_claim_source() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.claim_source is null then
    new.claim_source := case when new.source = 'LEGACY_BACKFILL' then 'BACKFILL' else 'DETAIL_CLAIM' end;
  end if;
  return new;
end $$;
drop trigger if exists certificates_claim_source_default on public.certificates;
create trigger certificates_claim_source_default before insert on public.certificates
  for each row execute function public.certificates_default_claim_source();

alter table public.certificates alter column claim_source set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'certificates_claim_source_chk') then
    alter table public.certificates add constraint certificates_claim_source_chk
      check (claim_source in ('DETAIL_CLAIM','BATCH_CLAIM','ADMIN_MANUAL','BACKFILL'));
  end if;
end $$;
create index if not exists certificates_claim_group_idx on public.certificates(claim_group_id);

-- 2. Origen de la reclamación pendiente (se copia al certificado al aprobar).
alter table public.artworks
  add column if not exists pending_claim_source text,
  add column if not exists pending_claim_group_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'artworks_pending_claim_source_chk') then
    alter table public.artworks add constraint artworks_pending_claim_source_chk
      check (pending_claim_source is null or pending_claim_source in ('DETAIL_CLAIM','BATCH_CLAIM'));
  end if;
end $$;

-- 3. Inmutabilidad ampliada: snapshot, trazabilidad y colector congelados; PDF de una sola escritura;
--    estado solo ISSUED → SUPERSEDED/REVOKED.
create or replace function public.certificates_guard_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.artwork_id, new.owner_id, new.certificate_number, new.sku, new.title, new.artist, new.year,
      new.medium, new.technique, new.dimensions, new.edition, new.edition_type, new.primary_image_url,
      new.issued_at, new.data_hash, new.hash_algorithm, new.canonical_version, new.legacy_hash,
      new.version, new.source, new.issued_by, new.created_at, new.claim_source, new.claim_group_id,
      new.order_id, new.order_item_id, new.owner_name_snapshot, new.owner_email_snapshot,
      new.previous_certificate_id, new.revision_reason)
     is distinct from
     (old.artwork_id, old.owner_id, old.certificate_number, old.sku, old.title, old.artist, old.year,
      old.medium, old.technique, old.dimensions, old.edition, old.edition_type, old.primary_image_url,
      old.issued_at, old.data_hash, old.hash_algorithm, old.canonical_version, old.legacy_hash,
      old.version, old.source, old.issued_by, old.created_at, old.claim_source, old.claim_group_id,
      old.order_id, old.order_item_id, old.owner_name_snapshot, old.owner_email_snapshot,
      old.previous_certificate_id, old.revision_reason) then
    raise exception 'certificate_immutable' using errcode = '42501';
  end if;
  if (old.pdf_hash is not null and new.pdf_hash is distinct from old.pdf_hash)
     or (old.pdf_storage_path is not null and new.pdf_storage_path is distinct from old.pdf_storage_path)
     or (old.pdf_created_at is not null and new.pdf_created_at is distinct from old.pdf_created_at) then
    raise exception 'certificate_pdf_immutable' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (old.status = 'ISSUED' and new.status in ('SUPERSEDED','REVOKED')) then
    raise exception 'certificate_status_transition' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 4. Storage privado (sin políticas: solo service_role lee/escribe; descarga con URL firmada temporal).
insert into storage.buckets (id, name, public) values ('certificates', 'certificates', false)
  on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('certificate-assets', 'certificate-assets', false)
  on conflict (id) do update set public = false;

-- 5. Emisión central (DETAIL_CLAIM, BATCH_CLAIM, ADMIN_MANUAL). El hash lo calcula Node.
create or replace function public.issue_certificate_v2(
  _artwork_id uuid, _owner_id uuid, _issued_by uuid, _certificate_number text,
  _issued_at timestamptz, _data_hash text, _snapshot jsonb, _source text,
  _trace jsonb default '{}'::jsonb, _confirm_override boolean default false, _reissue boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a public.artworks%rowtype; existing public.certificates%rowtype; created public.certificates%rowtype;
  artist_name text; has_existing boolean; owner_name text; owner_email text; next_version integer;
begin
  if _source not in ('DETAIL_CLAIM','BATCH_CLAIM','ADMIN_MANUAL') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;
  owner_name := nullif(btrim(_trace->>'owner_name'), '');
  owner_email := lower(nullif(btrim(_trace->>'owner_email'), ''));

  select * into a from public.artworks where id = _artwork_id for update;
  if not found then raise exception 'artwork_not_found' using errcode = 'P0002'; end if;

  select * into existing from public.certificates where artwork_id = _artwork_id and status = 'ISSUED' for update;
  has_existing := found;

  if has_existing and not _reissue then
    -- Idempotente: reintentos, doble clic o la misma asignación devuelven el certificado vigente.
    if _source <> 'ADMIN_MANUAL'
       or (existing.owner_id is not distinct from _owner_id
           and (existing.owner_id is not null or lower(existing.owner_email_snapshot) is not distinct from owner_email)) then
      return jsonb_build_object('created', false, 'certificate', to_jsonb(existing));
    end if;
    raise exception 'active_certificate_exists' using errcode = '22023';
  end if;
  if _reissue then
    if _source <> 'ADMIN_MANUAL' then raise exception 'invalid_source' using errcode = '22023'; end if;
    if not has_existing then raise exception 'no_active_certificate' using errcode = '22023'; end if;
    -- Doble envío de una reemisión: la versión esperada ya fue reemplazada.
    if (_trace->>'expected_previous_id') is distinct from existing.id::text then
      return jsonb_build_object('created', false, 'certificate', to_jsonb(existing));
    end if;
    if not _confirm_override then raise exception 'confirmation_required' using errcode = '22023'; end if;
  end if;

  artist_name := null;
  if a.artist_profile_id is not null then
    select nullif(btrim(full_name),'') into artist_name from public.profiles where id = a.artist_profile_id for share;
    if artist_name is null then raise exception 'artist_profile_name_missing' using errcode = '22023'; end if;
  end if;

  if _source in ('DETAIL_CLAIM','BATCH_CLAIM') then
    if _owner_id is null or _owner_id is distinct from coalesce(a.pending_owner_id, a.current_owner_id) then
      raise exception 'owner_mismatch' using errcode = '22023';
    end if;
    if a.ownership_status::text not in ('CLAIM_PENDING','CLAIMED','SOLD','VERIFIED') then
      raise exception 'artwork_not_claimable' using errcode = '22023';
    end if;
  else
    if _owner_id is null and (owner_name is null or owner_email is null) then
      raise exception 'owner_required' using errcode = '22023';
    end if;
    if coalesce(to_jsonb(a)->>'availability_status', '') in ('AVAILABLE','RESERVED') then
      raise exception 'artwork_still_for_sale' using errcode = '22023';
    end if;
    if not _confirm_override and (
         (a.current_owner_id is not null and a.current_owner_id is distinct from _owner_id)
      or (a.pending_owner_id is not null and a.pending_owner_id is distinct from _owner_id)) then
      raise exception 'ownership_conflict' using errcode = '22023';
    end if;
  end if;

  if (_snapshot->>'sku', _snapshot->>'title', _snapshot->>'artist', _snapshot->>'year', _snapshot->>'medium',
      _snapshot->>'technique', _snapshot->>'dimensions', _snapshot->>'edition', _snapshot->>'edition_type')
     is distinct from
     (nullif(btrim(a.sku::text),''), nullif(btrim(a.title::text),''), artist_name,
      nullif(btrim(to_jsonb(a)->>'year'),''), nullif(btrim(to_jsonb(a)->>'medium'),''),
      nullif(btrim(to_jsonb(a)->>'technique'),''), nullif(btrim(to_jsonb(a)->>'dimensions'),''),
      nullif(btrim(to_jsonb(a)->>'edition'),''), nullif(btrim(to_jsonb(a)->>'edition_type'),'')) then
    raise exception 'snapshot_stale' using errcode = '40001';
  end if;

  if has_existing then
    update public.certificates set status = 'SUPERSEDED' where id = existing.id;
  end if;
  next_version := coalesce((select max(version) from public.certificates where artwork_id = _artwork_id), 0) + 1;

  insert into public.certificates(artwork_id, owner_id, certificate_number, sku, title, artist, year, medium,
    technique, dimensions, edition, edition_type, primary_image_url, issued_at, data_hash, legacy_hash,
    version, source, issued_by, claim_source, claim_group_id, order_id, order_item_id,
    owner_name_snapshot, owner_email_snapshot, previous_certificate_id, revision_reason)
  values (_artwork_id, _owner_id, _certificate_number, _snapshot->>'sku', _snapshot->>'title', _snapshot->>'artist',
    _snapshot->>'year', _snapshot->>'medium', _snapshot->>'technique', _snapshot->>'dimensions',
    _snapshot->>'edition', _snapshot->>'edition_type', _snapshot->>'primary_image_url', _issued_at, _data_hash,
    case when has_existing then null else a.certificate_hash end,
    next_version, 'APPROVAL', _issued_by, _source,
    nullif(_trace->>'claim_group_id','')::uuid, nullif(_trace->>'order_id','')::uuid, nullif(_trace->>'order_item_id','')::uuid,
    owner_name, owner_email, case when has_existing then existing.id end, nullif(btrim(_trace->>'reason'),''))
  returning * into created;

  -- Compatibilidad con la UI actual. La disponibilidad de venta NO se modifica.
  update public.artworks set current_owner_id = _owner_id, pending_owner_id = null, ownership_status = 'VERIFIED',
    certificate_number = _certificate_number, certificate_hash = _data_hash, certificate_issued_at = _issued_at,
    pending_claim_source = null, pending_claim_group_id = null
  where id = _artwork_id;

  -- CERTIFICATE_ISSUED lo registra el trigger existente (dedupe por hash); se enlaza al certificado.
  update public.provenance_events
     set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('certificate_id', created.id,
       'certificate_number', created.certificate_number, 'issued_at', created.issued_at, 'data_hash', created.data_hash,
       'version', created.version, 'claim_source', created.claim_source, 'claim_group_id', created.claim_group_id)
   where dedupe_key = 'CERTIFICATE_ISSUED:' || _artwork_id || ':' || _data_hash;

  if _source in ('DETAIL_CLAIM','BATCH_CLAIM') then
    perform public.record_provenance(_artwork_id, 'CLAIM_APPROVED', 'Ownership claim approved',
      'The collector claim was reviewed and approved by Estudio JBU.', to_char(_issued_at, 'YYYY-MM-DD'), 'DAY',
      'CERTIFICATE', created.id::text, 'CLAIM_APPROVED:' || created.id, 'PRIVATE',
      jsonb_build_object('claim_source', _source, 'claim_group_id', created.claim_group_id), 'SYSTEM');
  else
    perform public.record_provenance(_artwork_id, 'OWNERSHIP_ASSIGNED_MANUALLY', 'Ownership assigned by Estudio JBU',
      'Estudio JBU validated the collector and registered ownership.', to_char(_issued_at, 'YYYY-MM-DD'), 'DAY',
      'CERTIFICATE', created.id::text, 'OWNERSHIP_ASSIGNED_MANUALLY:' || created.id, 'PRIVATE',
      jsonb_build_object('issued_by', _issued_by, 'override', _confirm_override), 'SYSTEM');
  end if;
  if has_existing then
    perform public.record_provenance(_artwork_id, 'CERTIFICATE_REISSUED', 'Certificate reissued as a new version',
      'A formal correction was issued; the previous version remains on record.', to_char(_issued_at, 'YYYY-MM-DD'), 'DAY',
      'CERTIFICATE', created.id::text, 'CERTIFICATE_REISSUED:' || created.id, 'PUBLIC',
      jsonb_build_object('version', created.version, 'previous_certificate_id', existing.id), 'SYSTEM');
  end if;

  return jsonb_build_object('created', true, 'certificate', to_jsonb(created));
end $$;
revoke all on function public.issue_certificate_v2(uuid, uuid, uuid, text, timestamptz, text, jsonb, text, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.issue_certificate_v2(uuid, uuid, uuid, text, timestamptz, text, jsonb, text, jsonb, boolean, boolean) to service_role;

-- 6. Registro del PDF definitivo (una sola vez por certificado).
create or replace function public.attach_certificate_pdf(_certificate_id uuid, _path text, _pdf_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.certificates%rowtype;
begin
  if _pdf_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_pdf_hash' using errcode = '22023'; end if;
  select * into c from public.certificates where id = _certificate_id for update;
  if not found then raise exception 'certificate_not_found' using errcode = 'P0002'; end if;
  if c.pdf_hash is not null then return jsonb_build_object('attached', false, 'certificate', to_jsonb(c)); end if;
  update public.certificates set pdf_storage_path = _path, pdf_hash = _pdf_hash, pdf_created_at = now()
   where id = _certificate_id returning * into c;
  perform public.record_provenance(c.artwork_id, 'CERTIFICATE_PDF_CREATED', 'Official certificate document created',
    'The signed certificate document was generated and sealed with a SHA-256 fingerprint.',
    to_char(now(), 'YYYY-MM-DD'), 'DAY', 'CERTIFICATE', c.id::text, 'CERTIFICATE_PDF_CREATED:' || c.id, 'PRIVATE',
    jsonb_build_object('version', c.version, 'pdf_hash', c.pdf_hash), 'SYSTEM');
  return jsonb_build_object('attached', true, 'certificate', to_jsonb(c));
end $$;
revoke all on function public.attach_certificate_pdf(uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_certificate_pdf(uuid, text, text) to service_role;

commit;
