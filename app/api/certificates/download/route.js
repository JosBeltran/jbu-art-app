import { requireUser, serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'
import { activeCertificateBySku, physicalEditionCertificateBySku } from '@/lib/certificates/lookup.server'
import { CERTIFICATE_BUCKET, resolveStoredCertificatePdf } from '@/lib/certificates/pdf.server'

// Descarga del PDF oficial persistente: solo el propietario registrado o un Admin.
// Devuelve una URL firmada de corta duración; el bucket nunca es público.
export async function GET(request) {
  try {
    const { user, isAdmin } = await requireUser(request)
    const sku = new URL(request.url).searchParams.get('sku')
    const db = serviceClient()
    const { certificate, error } = await activeCertificateBySku(db, sku)
    if (error) throw new HttpError(503, 'certificates_unavailable')
    if (!certificate) {
      const physical = await physicalEditionCertificateBySku(db, sku)
      if (physical.error) throw new HttpError(503, 'certificates_unavailable')
      if (!physical.certificate) throw new HttpError(404, 'certificate_not_found')
      const unitCertificate = physical.certificate
      if (!isAdmin && unitCertificate.owner_id !== user.id) throw new HttpError(403, 'forbidden')
      if (!unitCertificate.pdf_storage_path || !unitCertificate.pdf_hash) {
        throw new HttpError(409, 'pdf_pending')
      }
      const { data: signed, error: physicalError } = await db.storage.from(CERTIFICATE_BUCKET)
        .createSignedUrl(unitCertificate.pdf_storage_path, 120, {
          download: `${unitCertificate.certificate_number}.pdf`,
        })
      if (physicalError || !signed?.signedUrl) throw new HttpError(503, 'pdf_storage_unavailable')
      return Response.json({ url: signed.signedUrl, pdfHash: unitCertificate.pdf_hash }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    if (!isAdmin && certificate.owner_id !== user.id) throw new HttpError(403, 'forbidden')
    // Auto-reparacion: si el archivo existe en Storage aunque la metadata este incompleta,
    // se adopta y se completa pdf_storage_path/pdf_hash sin regenerar ni reemitir.
    const resolved = await resolveStoredCertificatePdf(db, certificate)
    if (!resolved) throw new HttpError(409, 'pdf_pending')
    const { data, error: signError } = await db.storage.from(CERTIFICATE_BUCKET)
      .createSignedUrl(resolved.path, 120, { download: `${certificate.certificate_number}.pdf` })
    if (signError || !data?.signedUrl) throw new HttpError(503, 'pdf_storage_unavailable')
    return Response.json({ url: data.signedUrl, pdfHash: resolved.hash }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return errorResponse(err, 'download')
  }
}
