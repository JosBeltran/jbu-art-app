import { serviceClient, getRequestUser, isAdminUser } from '@/lib/offersAuth'
import { collectMediaInventory } from '@/lib/mediaInventory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const db = serviceClient()
    const user = await getRequestUser(request, db)
    if (!user) return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 })
    if (!(await isAdminUser(user, db))) return Response.json({ error: 'FORBIDDEN' }, { status: 403 })
    const inventory = await collectMediaInventory(db)
    // The endpoint is authenticated admin-only. Never cache sensitive provenance.
    return Response.json(inventory, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json({ error: error?.message || 'Media inventory failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
