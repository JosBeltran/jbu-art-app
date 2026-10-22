import { requireUser, serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'
import { activeCertificateBySku } from '@/lib/certificates/lookup.server'
import { CERTIFICATE_BUCKET } from '@/lib/certificates/pdf.server'

// Descarga del PDF oficial persistente: solo el propietario registrado o un Admin.
// Devuelve una URL firmada de corta duración; el bucket nunca es público.
export async function GET(request) {
  try {
    const { user, isAdmin } = await requireUser(request)
    const sku = new URL(request.url).searchParams.get('sku')
    const db = serviceClient()
    const { certificate, error } = await activeCertificateBySku(db, sku)
    if (error) throw new HttpError(503, 'certificates_unavailable')
    if (!certificate) throw new HttpError(404, 'certificate_not_found')
    if (!isAdmin && certificate.owner_id !== user.id) throw new HttpError(403, 'forbidden')
    if (!certificate.pdf_storage_path || !certificate.pdf_hash) throw new HttpError(409, 'pdf_pending')
    const { data, error: signError } = await db.storage.from(CERTIFICATE_BUCKET)
      .createSignedUrl(certificate.pdf_storage_path, 120, { download: `${certificate.certificate_number}.pdf` })
    if (signError || !data?.signedUrl) throw new HttpError(503, 'pdf_storage_unavailable')
    return Response.json({ url: data.signedUrl, pdfHash: certificate.pdf_hash }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return errorResponse(err, 'download')
  }
}
