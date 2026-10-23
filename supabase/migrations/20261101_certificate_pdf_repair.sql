-- Reparacion de metadata de PDF de certificados (caso JBU-030/JBU-033: archivo en Storage, metadata incompleta).
-- attach_certificate_pdf ahora completa campos faltantes de forma segura:
--   - nunca sobrescribe un hash distinto ya registrado (devuelve conflict=true);
--   - si el hash coincide y falta el path, solo completa el path;
--   - si falta todo, registra path + hash como antes;
--   - la proveniencia CERTIFICATE_PDF_CREATED solo se graba cuando realmente se adjunta.
begin;

create or replace function public.attach_certificate_pdf(_certificate_id uuid, _path text, _pdf_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.certificates%rowtype;
begin
  if _pdf_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_pdf_hash' using errcode = '22023'; end if;
  select * into c from public.certificates where id = _certificate_id for update;
  if not found then raise exception 'certificate_not_found' using errcode = 'P0002'; end if;
  -- Nunca sobrescribir un hash distinto ya registrado.
  if c.pdf_hash is not null and c.pdf_hash <> _pdf_hash then
    return jsonb_build_object('attached', false, 'conflict', true, 'certificate', to_jsonb(c));
  end if;
  -- Ya completo: idempotente, no hacer nada.
  if c.pdf_hash is not null and c.pdf_storage_path is not null then
    return jsonb_build_object('attached', false, 'conflict', false, 'certificate', to_jsonb(c));
  end if;
  update public.certificates set pdf_storage_path = _path, pdf_hash = _pdf_hash, pdf_created_at = coalesce(pdf_created_at, now())
   where id = _certificate_id returning * into c;
  perform public.record_provenance(c.artwork_id, 'CERTIFICATE_PDF_CREATED', 'Official certificate document created',
    'The signed certificate document was generated and sealed with a SHA-256 fingerprint.',
    to_char(now(), 'YYYY-MM-DD'), 'DAY', 'CERTIFICATE', c.id::text, 'CERTIFICATE_PDF_CREATED:' || c.id, 'PRIVATE',
    jsonb_build_object('version', c.version, 'pdf_hash', c.pdf_hash), 'SYSTEM');
  return jsonb_build_object('attached', true, 'conflict', false, 'certificate', to_jsonb(c));
end $$;
revoke all on function public.attach_certificate_pdf(uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_certificate_pdf(uuid, text, text) to service_role;

commit;
