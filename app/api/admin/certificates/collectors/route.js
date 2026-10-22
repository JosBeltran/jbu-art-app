import { requireCertificateAdmin, serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'

// Búsqueda de coleccionistas existentes por nombre o correo (solo Admin, máx. 10).
export async function GET(request) {
  try {
    await requireCertificateAdmin(request)
    const q = String(new URL(request.url).searchParams.get('q') || '').trim().replace(/[%,()*]/g, ' ').slice(0, 80)
    if (q.length < 2) return Response.json({ collectors: [] })
    const db = serviceClient()
    const { data, error } = await db.from('profiles').select('id, full_name, email')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).order('full_name').limit(10)
    if (error) throw new HttpError(503, 'profiles_unavailable')
    return Response.json({ collectors: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return errorResponse(err, 'collectors')
  }
}
