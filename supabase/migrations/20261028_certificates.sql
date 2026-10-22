-- Fase 1: registro persistente e inmutable de certificados de autenticidad.
-- Aditiva: no elimina ni renombra campos de artworks. `certificates` pasa a ser la
-- fuente de verdad futura; artworks.certificate_* se mantienen por compatibilidad.

-- 0. Campo legacy usado por la UI pero no declarado en migraciones anteriores.
alter table public.artworks add column if not exists certificate_number text;

-- 1. Tabla
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete restrict,
  owner_id uuid references public.profiles(id) on delete set null,
  certificate_number text not null,
  sku text not null,
  title text,
  artist text,
  year text,               -- texto: artworks.year no tiene tipo declarado en el repo
  medium text,
  technique text,
  dimensions text,
  edition text,
  edition_type text,
  primary_image_url text,
  issued_at timestamptz not null default now(),
  data_hash text not null check (data_hash ~ '^[0-9a-f]{64}$'),
  hash_algorithm text not null default 'SHA-256',
  canonical_version text not null default 'jbu-coa-v1',
  legacy_hash text,        -- hash anterior (no es de integridad); solo auditoría
  pdf_hash text,           -- Fase 2
  pdf_storage_path text,   -- Fase 2
  status text not null default 'ISSUED' check (status in ('ISSUED','SUPERSEDED','REVOKED')),
  version integer not null default 1 check (version >= 1),
  source text not null default 'APPROVAL' check (source in ('APPROVAL','LEGACY_BACKFILL')),
  issued_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Grants (solo lectura para usuarios; escritura únicamente service_role/RPC)
grant select on public.certificates to authenticated;
grant all on public.certificates to service_role;
revoke insert, update, delete on public.certificates from anon, authenticated;

-- 3. Índices y restricciones
create index if not exists certificates_artwork_idx on public.certificates(artwork_id);
create index if not exists certificates_sku_idx on public.certificates(upper(sku));
create index if not exists certificates_owner_idx on public.certificates(owner_id);
create unique index if not exists certificates_number_key on public.certificates(certificate_number);
create unique index if not exists certificates_artwork_version_key on public.certificates(artwork_id, version);
-- Un único certificado vigente por obra; versiones futuras pasan la anterior a SUPERSEDED.
create unique index if not exists certificates_one_active_per_artwork
  on public.certificates(artwork_id) where status = 'ISSUED';

-- 4. Inmutabilidad del snapshot y del hash (aplica incluso a service_role)
create or replace function public.certificates_guard_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.artwork_id, new.owner_id, new.certificate_number, new.sku, new.title, new.artist, new.year,
      new.medium, new.technique, new.dimensions, new.edition, new.edition_type, new.primary_image_url,
      new.issued_at, new.data_hash, new.hash_algorithm, new.canonical_version, new.legacy_hash,
      new.version, new.source, new.issued_by, new.created_at)
     is distinct from
     (old.artwork_id, old.owner_id, old.certificate_number, old.sku, old.title, old.artist, old.year,
      old.medium, old.technique, old.dimensions, old.edition, old.edition_type, old.primary_image_url,
      old.issued_at, old.data_hash, old.hash_algorithm, old.canonical_version, old.legacy_hash,
      old.version, old.source, old.issued_by, old.created_at) then
    raise exception 'certificate_immutable' using errcode = '42501';
  end if;
  if old.pdf_hash is not null and new.pdf_hash is distinct from old.pdf_hash then
    raise exception 'certificate_pdf_hash_immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists certificates_immutable on public.certificates;
create trigger certificates_immutable before update on public.certificates
  for each row execute function public.certificates_guard_immutable();

-- 5. RLS
alter table public.certificates enable row level security;
drop policy if exists "certificates owner read" on public.certificates;
create policy "certificates owner read" on public.certificates
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "certificates admin read" on public.certificates;
create policy "certificates admin read" on public.certificates
  for select to authenticated using (public.is_jbu_admin());
-- Sin políticas de insert/update/delete: los clientes no pueden escribir.

-- 6. Emisión transaccional (llamada solo desde el servidor tras autorizar al Admin).
-- El hash lo calcula Node (lib/certificates); aquí se bloquea la obra, se valida que el
-- snapshot recibido coincide con la fila actual y se escribe todo en una sola transacción.
create or replace function public.issue_certificate(
  _artwork_id uuid, _owner_id uuid, _issued_by uuid, _certificate_number text,
  _issued_at timestamptz, _data_hash text, _snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.artworks%rowtype; existing public.certificates%rowtype; created public.certificates%rowtype;
begin
  select * into a from public.artworks where id = _artwork_id for update;
  if not found then raise exception 'artwork_not_found' using errcode = 'P0002'; end if;

  select * into existing from public.certificates where artwork_id = _artwork_id and status = 'ISSUED';
  if found then
    return jsonb_build_object('created', false, 'certificate', to_jsonb(existing));
  end if;

  if _owner_id is null or _owner_id is distinct from coalesce(a.pending_owner_id, a.current_owner_id) then
    raise exception 'owner_mismatch' using errcode = '22023';
  end if;
  if a.ownership_status::text not in ('CLAIM_PENDING','CLAIMED','SOLD','VERIFIED') then
    raise exception 'artwork_not_claimable' using errcode = '22023';
  end if;
  if (_snapshot->>'sku', _snapshot->>'title', _snapshot->>'artist', _snapshot->>'year', _snapshot->>'medium',
      _snapshot->>'technique', _snapshot->>'dimensions', _snapshot->>'edition', _snapshot->>'edition_type')
     is distinct from
     (nullif(btrim(a.sku::text),''), nullif(btrim(a.title::text),''), nullif(btrim(to_jsonb(a)->>'artist'),''),
      nullif(btrim(to_jsonb(a)->>'year'),''), nullif(btrim(to_jsonb(a)->>'medium'),''),
      nullif(btrim(to_jsonb(a)->>'technique'),''), nullif(btrim(to_jsonb(a)->>'dimensions'),''),
      nullif(btrim(to_jsonb(a)->>'edition'),''), nullif(btrim(to_jsonb(a)->>'edition_type'),'')) then
    raise exception 'snapshot_stale' using errcode = '40001';
  end if;

  insert into public.certificates(artwork_id, owner_id, certificate_number, sku, title, artist, year, medium,
    technique, dimensions, edition, edition_type, primary_image_url, issued_at, data_hash, legacy_hash,
    version, source, issued_by)
  values (_artwork_id, _owner_id, _certificate_number, _snapshot->>'sku', _snapshot->>'title', _snapshot->>'artist',
    _snapshot->>'year', _snapshot->>'medium', _snapshot->>'technique', _snapshot->>'dimensions',
    _snapshot->>'edition', _snapshot->>'edition_type', _snapshot->>'primary_image_url', _issued_at, _data_hash,
    a.certificate_hash,
    coalesce((select max(version) from public.certificates where artwork_id = _artwork_id), 0) + 1,
    'APPROVAL', _issued_by)
  returning * into created;

  -- Compatibilidad: la UI actual lee estos campos. certificate_hash = data_hash.
  update public.artworks set current_owner_id = _owner_id, ownership_status = 'VERIFIED',
    certificate_number = _certificate_number, certificate_hash = _data_hash, certificate_issued_at = _issued_at
  where id = _artwork_id;

  -- El trigger existente ya registró CERTIFICATE_ISSUED (dedupe por hash); se enlaza al certificado.
  update public.provenance_events
     set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('certificate_id', created.id,
       'certificate_number', created.certificate_number, 'issued_at', created.issued_at, 'data_hash', created.data_hash)
   where dedupe_key = 'CERTIFICATE_ISSUED:' || _artwork_id || ':' || _data_hash;

  return jsonb_build_object('created', true, 'certificate', to_jsonb(created));
end $$;
revoke all on function public.issue_certificate(uuid, uuid, uuid, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.issue_certificate(uuid, uuid, uuid, text, timestamptz, text, jsonb) to service_role;

-- 7. Backfill legacy (script Node scripts/backfill-certificates.mjs; no toca artworks).
create or replace function public.backfill_legacy_certificate(
  _artwork_id uuid, _certificate_number text, _issued_at timestamptz, _data_hash text, _snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.artworks%rowtype; existing public.certificates%rowtype; created public.certificates%rowtype;
begin
  select * into a from public.artworks where id = _artwork_id for update;
  if not found then raise exception 'artwork_not_found'; end if;
  select * into existing from public.certificates where artwork_id = _artwork_id and status = 'ISSUED';
  if found then return jsonb_build_object('created', false, 'certificate', to_jsonb(existing)); end if;
  if a.ownership_status::text <> 'VERIFIED' or a.certificate_hash is null or a.certificate_issued_at is null then
    raise exception 'not_legacy_certificate';
  end if;
  insert into public.certificates(artwork_id, owner_id, certificate_number, sku, title, artist, year, medium,
    technique, dimensions, edition, edition_type, primary_image_url, issued_at, data_hash, legacy_hash, version, source)
  values (_artwork_id, a.current_owner_id, _certificate_number, _snapshot->>'sku', _snapshot->>'title',
    _snapshot->>'artist', _snapshot->>'year', _snapshot->>'medium', _snapshot->>'technique', _snapshot->>'dimensions',
    _snapshot->>'edition', _snapshot->>'edition_type', _snapshot->>'primary_image_url', _issued_at, _data_hash,
    a.certificate_hash, 1, 'LEGACY_BACKFILL')
  returning * into created;
  return jsonb_build_object('created', true, 'certificate', to_jsonb(created));
end $$;
revoke all on function public.backfill_legacy_certificate(uuid, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.backfill_legacy_certificate(uuid, text, timestamptz, text, jsonb) to service_role;
