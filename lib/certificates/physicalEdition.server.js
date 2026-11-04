// Physical edition certificates are unit-scoped and never mutate the unique
// original certificates table nor artwork-level ownership.
import { buildSnapshot, normalizeArtworkForCertificate, certificateDataHash, CERTIFICATE_ARTWORK_SELECT } from './canonicalize.js'
import {
  renderCertificatePdf, loadArtworkImage, loadSignature, qrPng, sha256Hex,
  certificatePdfPath, CERTIFICATE_BUCKET,
} from './pdf.server.js'
import { certificateVerifyUrl } from './public.js'
import { HttpError } from './adminAuth.server.js'

export async function issuePhysicalEditionCertificate({ db, orderItemId, buyerId, now = () => new Date() }) {
  const { data: item, error: itemError } = await db.from('order_items')
    .select('id,order_id,artwork_id,physical_edition_unit_id')
    .eq('id', orderItemId).maybeSingle()
  if (itemError || !item?.physical_edition_unit_id) throw new HttpError(404, 'edition_order_item_not_found')

  const [{ data: order }, { data: unit }, { data: artwork, error: artworkError }] = await Promise.all([
    db.from('orders').select('id,buyer_user_id,payment_status,status').eq('id', item.order_id).maybeSingle(),
    db.from('artwork_edition_units').select('*').eq('id', item.physical_edition_unit_id).maybeSingle(),
    db.from('artworks').select(CERTIFICATE_ARTWORK_SELECT).eq('id', item.artwork_id).maybeSingle(),
  ])
  if (!order || order.buyer_user_id !== buyerId) throw new HttpError(403, 'forbidden')
  if (order.payment_status !== 'PAID' || order.status !== 'DELIVERED') throw new HttpError(409, 'certificate_requires_paid_delivery')
  if (artworkError || !artwork || !unit || unit.artwork_id !== artwork.id ||
      unit.order_item_id !== item.id || unit.status !== 'SOLD' ||
      artwork.physical_edition_type !== 'LIMITED_EDITION') {
    throw new HttpError(409, 'edition_sale_integrity_error')
  }

  const width = Math.max(3, String(artwork.physical_edition_size).length)
  const edition = `${String(unit.edition_number).padStart(width, '0')}/${String(artwork.physical_edition_size).padStart(width, '0')}`
  let art
  try { art = normalizeArtworkForCertificate(artwork) }
  catch { throw new HttpError(409, 'artist_profile_name_missing') }
  const snapshot = buildSnapshot({
    ...art,
    sku: unit.unit_identifier,
    artist: art.artist || 'Estudio JBU',
    edition,
    edition_type: 'PHYSICAL_LIMITED_EDITION',
  })
  const issuedAt = now().toISOString()
  const certNumber = `COA-${unit.unit_identifier.toUpperCase()}`
  const hash = certificateDataHash({
    certificateNumber: certNumber,
    artworkId: artwork.id,
    ownerId: buyerId,
    issuedAt,
    snapshot,
  })
  const { data: result, error } = await db.rpc('issue_physical_edition_certificate', {
    _unit: unit.id,
    _owner: buyerId,
    _issued_at: issuedAt,
    _data_hash: hash,
    _snapshot: snapshot,
  })
  if (error || !result?.certificate) {
    throw new HttpError(503, 'edition_certificate_issue_failed', error?.message)
  }
  const certificate = result.certificate
  // The issuance and PDF storage are independently idempotent.
  let pdfReady = Boolean(certificate.pdf_hash && certificate.pdf_storage_path)
  if (!pdfReady) {
    try {
      await ensurePhysicalEditionPdf(db, certificate)
      pdfReady = true
    } catch (err) {
      console.error('[physical-edition] certificate issued, PDF pending', {
        unit: unit.id, certificateId: certificate.id, code: err?.message,
      })
    }
  }
  return { certificate, created: Boolean(result.created), pdfReady }
}

export async function ensurePhysicalEditionPdf(db, certificate) {
  if (certificate.pdf_hash && certificate.pdf_storage_path) return certificate
  const path = certificatePdfPath(certificate)
  const bucket = db.storage.from(CERTIFICATE_BUCKET)
  // If another worker uploaded first, recover its bytes instead of generating
  // a different PDF that would break immutable hash verification.
  let bytes
  const stored = await bucket.download(path)
  if (stored.data) {
    bytes = Buffer.from(await stored.data.arrayBuffer())
  } else {
    const [image, signature, qr] = await Promise.all([
      loadArtworkImage(certificate.primary_image_url, { db }),
      loadSignature(db),
      qrPng(certificateVerifyUrl(certificate.sku)),
    ])
    bytes = await renderCertificatePdf(certificate, { image, signature, qr })
    const { error: uploadError } = await bucket.upload(path, bytes, {
      contentType: 'application/pdf', cacheControl: '31536000', upsert: false,
    })
    if (uploadError) {
      const winner = await bucket.download(path)
      if (!winner.data) throw new HttpError(503, 'pdf_storage_unavailable', uploadError.message)
      bytes = Buffer.from(await winner.data.arrayBuffer())
    }
  }
  const { data, error } = await db.rpc('attach_physical_edition_certificate_pdf', {
    _certificate: certificate.id, _path: path, _hash: sha256Hex(bytes),
  })
  if (error || !data) throw new HttpError(503, 'edition_pdf_attach_failed', error?.message)
  return data
}
