# Certificados — Fase 1

- `certificates` es la fuente de verdad futura; `artworks.certificate_*` se mantienen por compatibilidad (certificate_hash = certificates.data_hash en emisiones nuevas).
- Autorización: Bearer de sesión → `auth.getUser` → `is_jbu_admin()` ejecutada con el JWT del usuario. 401 sin sesión, 403 no admin, 503 si el rol no se puede comprobar. Cliente de servicio solo después.
- Emisión: `lib/certificates/issueCertificate.server.js` + RPC `issue_certificate` (transacción única con bloqueo de la obra): inserta certificado, actualiza artworks, enlaza el evento de procedencia CERTIFICATE_ISSUED existente. Idempotente: si hay un certificado ISSUED se devuelve sin nuevo hash ni fecha; índice único parcial impide duplicados en carrera.
- Hash `jbu-coa-v1`: SHA-256 hex (UTF-8, Node crypto) de JSON con orden fijo: canonical_version, certificate_number, artwork_id, sku, title, artist, year, medium, technique, dimensions, edition, edition_type, owner_id, issued_at. Vacíos/undefined → null, texto recortado, números como texto, fecha ISO UTC.
- Inmutabilidad: trigger impide cambiar snapshot, hash, owner o fecha (incluso con service_role).
- Backfill: `scripts/backfill-certificates.mjs` (dry-run por defecto, `--apply`). Hash nuevo recalculado; el anterior queda en `legacy_hash`. No modifica artworks.
- Pendiente Fase 2: /verify desde certificates, PDF persistente y pdf_hash.
