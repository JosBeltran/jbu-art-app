// Emisión de certificado tras aprobar una reclamación. Fuente de verdad: tabla certificates.
import { buildSnapshot, certificateDataHash, certificateNumberFor } from './canonicalize.js'
import { HttpError } from './adminAuth.server.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const log = (event, data) => console.info(`[certificates] ${event}`, data)

const ARTWORK_FIELDS = 'id, sku, title, artist, year, medium, technique, dimensions, edition, edition_type, primary_image_url, image_url, ownership_status, current_owner_id, pending_owner_id, certificate_number, certificate_hash'

export async function issueCertificate({ db, artworkId, ownerId, adminId, now = () => new Date() }) {
  if (!UUID.test(String(artworkId || '')) || !UUID.test(String(ownerId || ''))) throw new HttpError(400, 'invalid_input')
  log('issuance started', { artworkId })

  const { data: existing, error: existingError } = await db.from('certificates')
    .select('*').eq('artwork_id', artworkId).eq('status', 'ISSUED').maybeSingle()
  if (existingError) throw new HttpError(503, 'certificates_unavailable', existingError.message)
  if (existing) { log('certificate exists (idempotent)', { artworkId, certificateId: existing.id }); return { created: false, certificate: existing } }

  const { data: artwork, error: artworkError } = await db.from('artworks').select(ARTWORK_FIELDS).eq('id', artworkId).maybeSingle()
  if (artworkError) throw new HttpError(503, 'artwork_unavailable', artworkError.message)
  if (!artwork) throw new HttpError(404, 'artwork_not_found')
  const expectedOwner = artwork.pending_owner_id || artwork.current_owner_id
  if (!expectedOwner || expectedOwner !== ownerId) throw new HttpError(409, 'owner_mismatch')

  const snapshot = buildSnapshot(artwork)
  const certificateNumber = certificateNumberFor(artwork, 1)
  const issuedAt = now().toISOString()
  const dataHash = certificateDataHash({ certificateNumber, artworkId, ownerId, issuedAt, snapshot })

  const { data, error } = await db.rpc('issue_certificate', {
    _artwork_id: artworkId, _owner_id: ownerId, _issued_by: adminId, _certificate_number: certificateNumber,
    _issued_at: issuedAt, _data_hash: dataHash, _snapshot: snapshot,
  })
  if (error) {
    const reason = String(error.message || '')
    if (/owner_mismatch/.test(reason)) throw new HttpError(409, 'owner_mismatch')
    if (/artwork_not_claimable/.test(reason)) throw new HttpError(409, 'artwork_not_claimable')
    if (/snapshot_stale/.test(reason)) throw new HttpError(409, 'snapshot_stale')
    if (/artwork_not_found/.test(reason)) throw new HttpError(404, 'artwork_not_found')
    if (error.code === '23505') {
      // Carrera con otra petición: devolver el certificado ganador.
      const { data: winner } = await db.from('certificates').select('*').eq('artwork_id', artworkId).eq('status', 'ISSUED').maybeSingle()
      if (winner) { log('certificate exists (idempotent)', { artworkId, certificateId: winner.id }); return { created: false, certificate: winner } }
    }
    if (error.code === 'PGRST202' || /issue_certificate/.test(reason)) throw new HttpError(503, 'certificates_migration_missing')
    throw new HttpError(500, 'issuance_failed', reason)
  }
  const result = { created: Boolean(data?.created), certificate: data?.certificate }
  log(result.created ? 'certificate created; artwork updated; provenance linked' : 'certificate exists (idempotent)', { artworkId, certificateId: result.certificate?.id })
  return result
}
