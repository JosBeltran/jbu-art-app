// Motor único de emisión de certificados (DETAIL_CLAIM, BATCH_CLAIM, ADMIN_MANUAL). Solo servidor.
// Fuente de verdad: tabla certificates. La transacción vive en la RPC issue_certificate_v2.
import { buildSnapshot, certificateDataHash, certificateNumberFor, CERTIFICATE_ARTWORK_SELECT, normalizeArtworkForCertificate } from './canonicalize.js'
import { HttpError } from './adminAuth.server.js'
import { ensureCertificatePdf } from './pdf.server.js'

export const CLAIM_SOURCES = ['DETAIL_CLAIM', 'BATCH_CLAIM', 'ADMIN_MANUAL']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const log = (event, data) => console.info(`[certificates] ${event}`, data)
const isUuid = (v) => UUID.test(String(v || ''))
const clean = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s }

const RPC_ERRORS = [
  ['owner_mismatch', 409], ['artwork_not_claimable', 409], ['snapshot_stale', 409], ['artist_profile_name_missing', 409],
  ['active_certificate_exists', 409], ['ownership_conflict', 409], ['confirmation_required', 409], ['no_active_certificate', 409],
  ['artwork_still_for_sale', 409], ['owner_required', 400], ['invalid_source', 400], ['artwork_not_found', 404],
]

async function activeCertificate(db, artworkId) {
  const { data, error } = await db.from('certificates').select('*').eq('artwork_id', artworkId).eq('status', 'ISSUED').maybeSingle()
  if (error) throw new HttpError(503, 'certificates_unavailable', error.message)
  return data || null
}

/** Referencias de venta cuando existen; nunca obligatorias (históricas, regalos, backfill). */
async function resolveOrderRefs(db, artworkId) {
  try {
    const { data } = await db.from('order_items').select('id, order_id, claim_group_id').eq('artwork_id', artworkId)
      .order('created_at', { ascending: false }).limit(1)
    const item = Array.isArray(data) ? data[0] : null
    return item ? { orderId: item.order_id || null, orderItemId: item.id || null, claimGroupId: item.claim_group_id || null } : {}
  } catch { return {} }
}

async function resolveOwnerSnapshot(db, { ownerId, ownerName, ownerEmail }) {
  if (ownerId) {
    const { data: profile, error } = await db.from('profiles').select('id, full_name, email').eq('id', ownerId).maybeSingle()
    if (error) throw new HttpError(503, 'profiles_unavailable', error.message)
    if (!profile) throw new HttpError(404, 'collector_not_found')
    return { name: clean(profile.full_name) || clean(ownerName), email: clean(profile.email)?.toLowerCase() || clean(ownerEmail)?.toLowerCase() || null }
  }
  const name = clean(ownerName); const email = clean(ownerEmail)?.toLowerCase() || null
  if (!name || !email || !EMAIL.test(email)) throw new HttpError(400, 'owner_required')
  return { name, email }
}

async function withPdf(db, certificate, generatePdf) {
  if (!certificate) return { ready: false, error: 'certificate_missing' }
  if (certificate.pdf_hash && certificate.pdf_storage_path) return { ready: true, certificate }
  try {
    const updated = await generatePdf({ db, certificate })
    return { ready: true, certificate: updated }
  } catch (err) {
    console.error('[certificates] pdf pending', { certificateId: certificate.id, code: err?.code || err?.message, detail: err?.message })
    return { ready: false, error: err?.code || 'pdf_failed', detail: err?.message && err.message !== err?.code ? err.message : null }
  }
}

/**
 * Emite (o devuelve, idempotente) el certificado de una obra.
 * - DETAIL_CLAIM / BATCH_CLAIM: el propietario debe ser el solicitante registrado.
 * - ADMIN_MANUAL: colector existente (ownerId) o sin cuenta (ownerName + ownerEmail, owner_id null).
 * - reissue: nueva versión explícita; la anterior pasa a SUPERSEDED, nunca se sobrescribe.
 */
export async function issueCertificate({
  db, artworkId, ownerId = null, ownerName = null, ownerEmail = null, source = null,
  claimGroupId = null, orderId = null, orderItemId = null, issuedBy = null, adminId = null,
  confirmOverride = false, reissue = false, expectedPreviousId = null, reason = null,
  now = () => new Date(), generatePdf = ensureCertificatePdf,
}) {
  const issuer = issuedBy || adminId || null
  if (!isUuid(artworkId)) throw new HttpError(400, 'invalid_input')
  if (ownerId !== null && ownerId !== undefined && ownerId !== '' && !isUuid(ownerId)) throw new HttpError(400, 'invalid_input')
  const owner = isUuid(ownerId) ? ownerId : null
  if (source && !CLAIM_SOURCES.includes(source)) throw new HttpError(400, 'invalid_source')
  if (source !== 'ADMIN_MANUAL' && !owner) throw new HttpError(400, 'invalid_input')
  if (reissue && source !== 'ADMIN_MANUAL') throw new HttpError(400, 'invalid_source')
  log('issuance started', { artworkId, source: source || 'claim' })

  const existing = await activeCertificate(db, artworkId)
  if (existing && !reissue) {
    const sameOwner = existing.owner_id
      ? existing.owner_id === owner
      : !owner && String(existing.owner_email_snapshot || '').toLowerCase() === String(clean(ownerEmail) || '').toLowerCase()
    if (source !== 'ADMIN_MANUAL' || sameOwner) {
      log('certificate exists (idempotent)', { artworkId, certificateId: existing.id })
      return { created: false, certificate: existing, pdf: await withPdf(db, existing, generatePdf) }
    }
    throw new HttpError(409, 'active_certificate_exists')
  }
  if (reissue && !existing) throw new HttpError(409, 'no_active_certificate')

  const { data: artwork, error: artworkError } = await db.from('artworks').select(CERTIFICATE_ARTWORK_SELECT).eq('id', artworkId).maybeSingle()
  if (artworkError) throw new HttpError(503, 'artwork_unavailable', artworkError.message)
  if (!artwork) throw new HttpError(404, 'artwork_not_found')

  const resolvedSource = source || (artwork.pending_claim_source === 'BATCH_CLAIM' ? 'BATCH_CLAIM' : 'DETAIL_CLAIM')
  if (resolvedSource !== 'ADMIN_MANUAL') {
    const expectedOwner = artwork.pending_owner_id || artwork.current_owner_id
    if (!expectedOwner || expectedOwner !== owner) throw new HttpError(409, 'owner_mismatch')
  }

  let normalizedArtwork
  try { normalizedArtwork = normalizeArtworkForCertificate(artwork) } catch { throw new HttpError(409, 'artist_profile_name_missing') }
  const snapshot = buildSnapshot(normalizedArtwork)
  const collector = await resolveOwnerSnapshot(db, { ownerId: owner, ownerName, ownerEmail })
  const refs = await resolveOrderRefs(db, artworkId)
  const version = reissue ? Number(existing.version || 1) + 1 : 1
  const certificateNumber = reissue ? certificateNumberFor({ sku: artwork.sku }, version) : certificateNumberFor(artwork, 1)
  const issuedAt = now().toISOString()
  const dataHash = certificateDataHash({ certificateNumber, artworkId, ownerId: owner, issuedAt, snapshot })
  const trace = {
    claim_group_id: claimGroupId || artwork.pending_claim_group_id || refs.claimGroupId || null,
    order_id: orderId || refs.orderId || null,
    order_item_id: orderItemId || refs.orderItemId || null,
    owner_name: collector.name, owner_email: collector.email,
    expected_previous_id: reissue ? (expectedPreviousId || existing.id) : null,
    reason: clean(reason),
  }

  const { data, error } = await db.rpc('issue_certificate_v2', {
    _artwork_id: artworkId, _owner_id: owner, _issued_by: issuer, _certificate_number: certificateNumber,
    _issued_at: issuedAt, _data_hash: dataHash, _snapshot: snapshot, _source: resolvedSource,
    _trace: trace, _confirm_override: Boolean(confirmOverride), _reissue: Boolean(reissue),
  })
  if (error) {
    const reasonText = String(error.message || '')
    for (const [code, status] of RPC_ERRORS) if (reasonText.includes(code)) throw new HttpError(status, code)
    if (error.code === '23505') {
      const winner = await activeCertificate(db, artworkId)
      if (winner) return { created: false, certificate: winner, pdf: await withPdf(db, winner, generatePdf) }
    }
    if (error.code === 'PGRST202' || /issue_certificate_v2/.test(reasonText)) throw new HttpError(503, 'certificates_migration_missing')
    throw new HttpError(500, 'issuance_failed', reasonText)
  }
  const certificate = data?.certificate
  log(data?.created ? 'certificate created' : 'certificate exists (idempotent)', { artworkId, certificateId: certificate?.id, source: resolvedSource })
  return { created: Boolean(data?.created), certificate, pdf: await withPdf(db, certificate, generatePdf) }
}
