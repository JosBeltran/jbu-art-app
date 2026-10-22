// Backfill de certificados legacy → tabla certificates (Fase 1).
// Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-certificates.mjs [--apply]
// Sin --apply solo informa. Nunca modifica artworks: el hash legacy queda en artworks y en certificates.legacy_hash.
import { createClient } from '@supabase/supabase-js'
import { buildSnapshot, certificateDataHash, certificateNumberFor, CERTIFICATE_ARTWORK_SELECT, normalizeArtworkForCertificate } from '../lib/certificates/canonicalize.js'

const apply = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

// Paginación: no truncar silenciosamente en el límite de filas de PostgREST.
const rows = []
for (let offset = 0; ; offset += 500) {
  const { data, error } = await db.from('artworks')
    .select(CERTIFICATE_ARTWORK_SELECT)
    .eq('ownership_status', 'VERIFIED').not('certificate_hash', 'is', null).not('certificate_issued_at', 'is', null)
    .order('id').range(offset, offset + 499)
  if (error) { console.error('Lectura fallida:', error.message, '\nRevisa que esté aplicada 20261029_artwork_artist_profile.sql.'); process.exit(1) }
  rows.push(...(data || []))
  if (!data || data.length < 500) break
}

let created = 0, existing = 0, failed = 0
for (const a of rows) {
  try {
  const normalizedArtwork = normalizeArtworkForCertificate(a)
  const snapshot = buildSnapshot(normalizedArtwork)
  const certificateNumber = certificateNumberFor(a, 1)
  const dataHash = certificateDataHash({ certificateNumber, artworkId: a.id, ownerId: a.current_owner_id, issuedAt: a.certificate_issued_at, snapshot })
  if (!apply) { console.log('[dry-run]', a.sku, certificateNumber, 'artist:', snapshot.artist ?? '(sin artista asociado)'); continue }
  const { data, error: rpcError } = await db.rpc('backfill_legacy_certificate', {
    _artwork_id: a.id, _certificate_number: certificateNumber, _issued_at: new Date(a.certificate_issued_at).toISOString(), _data_hash: dataHash, _snapshot: snapshot,
  })
  if (rpcError) { failed++; console.error('[error]', a.sku, rpcError.message) }
  else if (data?.created) created++; else existing++
  } catch (error) { failed++; console.error('[error]', a.sku, error.message) }
}
console.log(JSON.stringify({ detected: rows.length, apply, created, existing, failed }))
if (failed) process.exitCode = 1
