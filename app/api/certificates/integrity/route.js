import { serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'
import { activeCertificateBySku } from '@/lib/certificates/lookup.server'
import { verifyCertificateData } from '@/lib/certificates/integrity.server'
import { verifyStoredPdf } from '@/lib/certificates/pdf.server'

// Comprobación pública bajo demanda: solo devuelve booleanos, nunca datos privados.
export async function GET(request) {
  try {
    const sku = new URL(request.url).searchParams.get('sku')
    const db = serviceClient()
    const { certificate, error } = await activeCertificateBySku(db, sku)
    if (error) throw new HttpError(503, 'certificates_unavailable')
    if (!certificate) throw new HttpError(404, 'certificate_not_found')
    const data = verifyCertificateData(certificate)
    const pdf = await verifyStoredPdf(db, certificate)
    return Response.json({ data, pdf }, { headers: { 'Cache-Control': 'public, s-maxage=600' } })
  } catch (err) {
    return errorResponse(err, 'integrity')
  }
}
