// Backfill de certificados legacy → tabla certificates (Fase 1).
// Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-certificates.mjs [--apply]
// Sin --apply solo informa. Nunca modifica artworks: el hash legacy queda en artworks y en certificates.legacy_hash.
import { createClient } from '@supabase/supabase-js'
import { buildSnapshot, certificateDataHash, certificateNumberFor } from '../lib/certificates/canonicalize.js'

const apply = process.argv.includes('--apply')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const db = createClient(url, key, { auth: { persistSession: false } })

const { data: rows, error } = await db.from('artworks')
  .select('id, sku, title, artist, year, medium, technique, dimensions, edition, edition_type, primary_image_url, image_url, ownership_status, current_owner_id, certificate_number, certificate_hash, certificate_issued_at')
  .eq('ownership_status', 'VERIFIED').not('certificate_hash', 'is', null).not('certificate_issued_at', 'is', null)
if (error) { console.error('Lectura fallida:', error.message); process.exit(1) }

let created = 0, existing = 0, failed = 0
for (const a of rows) {
  const snapshot = buildSnapshot(a)
  const certificateNumber = certificateNumberFor(a, 1)
  const dataHash = certificateDataHash({ certificateNumber, artworkId: a.id, ownerId: a.current_owner_id, issuedAt: a.certificate_issued_at, snapshot })
  if (!apply) { console.log('[dry-run]', a.sku, certificateNumber); continue }
  const { data, error: rpcError } = await db.rpc('backfill_legacy_certificate', {
    _artwork_id: a.id, _certificate_number: certificateNumber, _issued_at: new Date(a.certificate_issued_at).toISOString(), _data_hash: dataHash, _snapshot: snapshot,
  })
  if (rpcError) { failed++; console.error('[error]', a.sku, rpcError.message) }
  else if (data?.created) created++; else existing++
}
console.log(JSON.stringify({ detected: rows.length, apply, created, existing, failed }))
