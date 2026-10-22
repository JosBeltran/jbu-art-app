import { requireCertificateAdmin, serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'
import { issueCertificate } from '@/lib/certificates/issueCertificate.server'

// Aprobación de reclamación → emisión de certificado.
// 1) Admin desde la sesión real (401/403). 2) Solo entonces cliente de servicio.
// 3) Motor central: origen DETAIL_CLAIM o BATCH_CLAIM según la reclamación registrada en la obra.
export async function POST(request) {
  try {
    const { user: admin } = await requireCertificateAdmin(request)
    let body
    try { body = await request.json() } catch { throw new HttpError(400, 'invalid_input') }
    const result = await issueCertificate({
      db: serviceClient(),
      artworkId: body?.artworkId,
      ownerId: body?.userId, // nuevo propietario: debe coincidir con el solicitante registrado de la obra
      adminId: admin.id,
    })
    const certificate = result.certificate || {}
    return Response.json({
      success: true,
      created: result.created,
      certificateId: certificate.id,
      certificateNumber: certificate.certificate_number,
      certificateHash: certificate.data_hash,
      issuedAt: certificate.issued_at,
      claimSource: certificate.claim_source,
      pdfReady: Boolean(result.pdf?.ready),
      pdfError: result.pdf?.ready ? null : result.pdf?.error || null,
    })
  } catch (err) {
    return errorResponse(err, 'approve')
  }
}
