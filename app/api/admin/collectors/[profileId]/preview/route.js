import { collectorPreview } from '@/lib/collection/admin.server'
import { errorResponse } from '@/lib/certificates/adminAuth.server'
export const dynamic = 'force-dynamic'
export async function GET(request, { params }) {
  try {
    const { profileId } = await params
    const data = await collectorPreview(request, profileId)
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization' } })
  } catch (error) {
    const response = errorResponse(error, 'collector-preview')
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}
