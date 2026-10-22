import { requireUser, serviceClient, errorResponse, HttpError } from '@/lib/certificates/adminAuth.server'
import { loadBatch, claimBatch } from '@/lib/certificates/batchClaim.server'

// Lote de reclamación (registro de colección). El token del enlace identifica el lote.
export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get('token')
    return Response.json(await loadBatch(serviceClient(), token), { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return errorResponse(err, 'batch-load')
  }
}

export async function POST(request) {
  try {
    const { user } = await requireUser(request)
    let body
    try { body = await request.json() } catch { throw new HttpError(400, 'invalid_input') }
    const result = await claimBatch(serviceClient(), { token: body?.token, userId: user.id, itemIds: body?.itemIds })
    return Response.json(result)
  } catch (err) {
    return errorResponse(err, 'batch-claim')
  }
}
