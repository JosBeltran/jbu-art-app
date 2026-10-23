import { requireUser, serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'
import { activeCertificateBySku } from '@/lib/certificates/lookup.server'
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
    if (!certificate) throw new HttpError(404, 'certificate_not_found')
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
