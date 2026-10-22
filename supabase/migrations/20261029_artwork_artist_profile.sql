-- Relación mínima de autoría. Aplicar DESPUÉS de 20261028_certificates.sql.
-- No crea artists, no añade artist text, no modifica roles/perfiles ni asocia obras.
begin;
alter table public.artworks add column if not exists artist_profile_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.artworks'::regclass and conname = 'artworks_artist_profile_id_fkey') then
    alter table public.artworks add constraint artworks_artist_profile_id_fkey
      foreign key (artist_profile_id) references public.profiles(id) on delete set null;
  end if;
end $$;
create index if not exists artworks_artist_profile_id_idx on public.artworks(artist_profile_id);
-- No se amplían grants/RLS existentes. La lectura de certificados usa service_role autorizado.

create or replace function public.issue_certificate(
  _artwork_id uuid, _owner_id uuid, _issued_by uuid, _certificate_number text,
  _issued_at timestamptz, _data_hash text, _snapshot jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.artworks%rowtype; existing public.certificates%rowtype; created public.certificates%rowtype; artist_name text;
begin
  select * into a from public.artworks where id = _artwork_id for update;
  if not found then raise exception 'artwork_not_found' using errcode = 'P0002'; end if;

  select * into existing from public.certificates where artwork_id = _artwork_id and status = 'ISSUED';
  if found then
    return jsonb_build_object('created', false, 'certificate', to_jsonb(existing));
  end if;


  -- Bloquea también el perfil hasta completar la transacción: el snapshot es histórico.
  artist_name := null;
  if a.artist_profile_id is not null then
    select nullif(btrim(full_name),'') into artist_name
      from public.profiles where id = a.artist_profile_id for share;
    if artist_name is null then raise exception 'artist_profile_name_missing' using errcode = '22023'; end if;
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
     (nullif(btrim(a.sku::text),''), nullif(btrim(a.title::text),''), artist_name,
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
declare a public.artworks%rowtype; existing public.certificates%rowtype; created public.certificates%rowtype; artist_name text;
begin
  select * into a from public.artworks where id = _artwork_id for update;
  if not found then raise exception 'artwork_not_found'; end if;
  select * into existing from public.certificates where artwork_id = _artwork_id and status = 'ISSUED';
  if found then return jsonb_build_object('created', false, 'certificate', to_jsonb(existing)); end if;
  if a.ownership_status::text <> 'VERIFIED' or a.certificate_hash is null or a.certificate_issued_at is null then
    raise exception 'not_legacy_certificate';
  end if;

  -- Bloquea también el perfil hasta completar la transacción: el snapshot es histórico.
  artist_name := null;
  if a.artist_profile_id is not null then
    select nullif(btrim(full_name),'') into artist_name
      from public.profiles where id = a.artist_profile_id for share;
    if artist_name is null then raise exception 'artist_profile_name_missing' using errcode = '22023'; end if;
  end if;

  if (_snapshot->>'artist') is distinct from artist_name then
    raise exception 'snapshot_stale' using errcode = '40001';
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

commit;
