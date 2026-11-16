import { getRequestUser } from './offersAuth.js'
import { buyerPhysicalHolds, reconcilePhysicalHold } from './physicalEditionRecovery.server.js'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function physicalEditionStatus(request, { db, stripe, bindShipping, cancel = false }) {
  try {
    const user = await getRequestUser(request, db)
    if (!user?.id) return Response.json({ error: 'auth_required' }, { status: 401, headers })
    let body = null
    if (cancel) {
      try { body = await request.json() }
      catch { return Response.json({ error: 'invalid_input' }, { status: 400, headers }) }
    }
    const artworkId = cancel ? body?.artworkId : new URL(request.url).searchParams.get('artworkId')
    // The only accepted selector is an artwork; hold and Stripe IDs are always
    // resolved from a server-side buyer-scoped query.
    if ((cancel && !artworkId) || (artworkId && !uuid.test(artworkId))) {
      return Response.json({ error: 'invalid_input' }, { status: 400, headers })
    }
    const holds = await buyerPhysicalHolds(db, user.id, artworkId)
    const purchases = await Promise.all(holds.map(hold => reconcilePhysicalHold({
      db, stripe, buyer: user.id, hold, cancel, bindShipping,
    })))
    return Response.json({ purchases }, { headers })
  } catch (error) {
    console.error('[physical-edition] recovery failed', { code: error?.message })
    return Response.json({ error: 'edition_status_unavailable' }, { status: 503, headers })
  }
}
