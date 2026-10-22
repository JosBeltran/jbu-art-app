import { requireCertificateAdmin, serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'
import { issueCertificate } from '@/lib/certificates/issueCertificate.server'
import { ensureCertificatePdf, verifyStoredPdf } from '@/lib/certificates/pdf.server'
import { verifyCertificateData } from '@/lib/certificates/integrity.server'
import { certificateClaimState } from '@/lib/certificates/public'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function profileSummary(db, id) {
  if (!id) return null
  const { data } = await db.from('profiles').select('id, full_name, email').eq('id', id).maybeSingle()
  return data || { id, full_name: null, email: null }
}

// Estado "Certificate & Ownership" de una obra (solo Admin).
export async function GET(request) {
  try {
    await requireCertificateAdmin(request)
    const artworkId = new URL(request.url).searchParams.get('artworkId')
    if (!UUID.test(String(artworkId || ''))) throw new HttpError(400, 'invalid_input')
    const db = serviceClient()
    const { data: artwork, error } = await db.from('artworks').select('*').eq('id', artworkId).maybeSingle()
    if (error) throw new HttpError(503, 'artwork_unavailable')
    if (!artwork) throw new HttpError(404, 'artwork_not_found')
    const { data: certificates, error: certError } = await db.from('certificates').select('*').eq('artwork_id', artworkId).order('version', { ascending: false })
    if (certError) throw new HttpError(503, 'certificates_unavailable')
    const active = (certificates || []).find((c) => c.status === 'ISSUED') || null
    return Response.json({
      artwork: {
        id: artwork.id, sku: artwork.sku, ownership_status: artwork.ownership_status ?? null,
        availability_status: artwork.availability_status ?? null, pending_claim_source: artwork.pending_claim_source ?? null,
        current_owner: await profileSummary(db, artwork.current_owner_id), pending_owner: await profileSummary(db, artwork.pending_owner_id),
      },
      state: certificateClaimState({ artwork, certificate: active }),
      certificates: (certificates || []).map((c) => ({ ...c, data_integrity: verifyCertificateData(c) })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return errorResponse(err, 'admin-state')
  }
}

// Acciones Admin: issue (manual o reemisión) | pdf (generar pendiente) | check_pdf.
export async function POST(request) {
  try {
    const { user: admin } = await requireCertificateAdmin(request)
    let body
    try { body = await request.json() } catch { throw new HttpError(400, 'invalid_input') }
    const db = serviceClient()

    if (body?.action === 'pdf' || body?.action === 'check_pdf') {
      if (!UUID.test(String(body.certificateId || ''))) throw new HttpError(400, 'invalid_input')
      const { data: certificate } = await db.from('certificates').select('*').eq('id', body.certificateId).maybeSingle()
      if (!certificate) throw new HttpError(404, 'certificate_not_found')
      if (body.action === 'check_pdf') return Response.json({ data: verifyCertificateData(certificate), pdf: await verifyStoredPdf(db, certificate) })
      const updated = await ensureCertificatePdf({ db, certificate })
      return Response.json({ success: true, certificate: updated })
    }

    if (body?.action !== 'issue') throw new HttpError(400, 'invalid_action')
    const result = await issueCertificate({
      db, source: 'ADMIN_MANUAL', issuedBy: admin.id,
      artworkId: body.artworkId, ownerId: body.ownerId || null, ownerName: body.ownerName, ownerEmail: body.ownerEmail,
      confirmOverride: body.confirmOverride === true, reissue: body.reissue === true,
      expectedPreviousId: body.expectedPreviousId || null, reason: body.reason || null,
    })
    return Response.json({ success: true, created: result.created, certificate: result.certificate, pdfReady: Boolean(result.pdf?.ready), pdfError: result.pdf?.ready ? null : result.pdf?.error || null, pdfDetail: result.pdf?.ready ? null : result.pdf?.detail || null })
  } catch (err) {
    return errorResponse(err, 'admin-issue')
  }
}
