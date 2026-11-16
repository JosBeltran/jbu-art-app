// Server callers supply authenticated identity and clients. Never accept a hold
// or Stripe session ID from the browser. Exported functions are also testable
// without payment credentials or production data.
export const physicalCheckoutSelect = `id,artwork_id,buyer_user_id,unit_id,status,expires_at,created_at,
 stripe_session_id,creation_state,stripe_create_params,stripe_creation_started_at,order_id,
 artwork:artworks!physical_edition_checkout_holds_artwork_id_fkey(id,sku,title,title_en,primary_image_url),
 unit:artwork_edition_units!physical_edition_checkout_holds_unit_id_fkey(status,unit_identifier,edition_number)`

export async function buyerPhysicalHolds(db, buyer, artworkId = null, activeOnly = false) {
  let query = db.from('physical_edition_checkout_holds').select(physicalCheckoutSelect)
    .eq('buyer_user_id', buyer).order('created_at', { ascending: false })
  if (artworkId) query = query.eq('artwork_id', artworkId)
  if (activeOnly || !artworkId) query = query.eq('status', 'HELD')
  const { data, error } = await query
  if (error) throw new Error('edition_status_unavailable')
  // Prefer an active hold over historical purchases/expirations.
  if (artworkId) return [data?.find(h => h.status === 'HELD') || data?.[0]].filter(Boolean)
  return data || []
}

function verifySession(hold, session, buyer) {
  if (hold.buyer_user_id !== buyer || session.id !== hold.stripe_session_id ||
      session.mode !== 'payment' || session.metadata?.physical_edition_checkout !== 'v1' ||
      session.metadata?.physical_edition_hold_id !== hold.id || session.metadata?.user_id !== buyer) {
    throw new Error('edition_session_verification_failed')
  }
}

async function rpc(db, name, args) {
  const result = await db.rpc(name, args)
  if (result.error) throw new Error('edition_reconciliation_failed')
  return result.data
}

// Only replay the exact persisted request, under Stripe's original idempotency
// key, while its retention is guaranteed (24h, with a 1h safety margin).
// An ambiguous legacy unbound hold is deliberately retained for investigation.
export async function recoverPhysicalSession(db, stripe, hold, bindShipping, now = Date.now()) {
  if (hold.stripe_session_id) return hold
  const age = now - Date.parse(hold.stripe_creation_started_at)
  let session = null
  if (hold.stripe_create_params && Number.isFinite(age) && age >= 0 && age < 23 * 60 * 60 * 1000) {
    try {
      session = await stripe.checkout.sessions.create(hold.stripe_create_params,
        { idempotencyKey: `jbu-physical-edition-${hold.id}` })
    } catch {
      // A cached session may still be discoverable when replay fails, including
      // an expired creation deadline. Never release on a Stripe API error.
    }
  }
  if (!session) {
    const created = Date.parse(hold.created_at)
    const deadline = Date.parse(hold.expires_at)
    if (!Number.isFinite(created) || !Number.isFinite(deadline)) return hold
    // Positive discovery only: absence from a bounded scan cannot prove there
    // was no payment. Legacy and old ambiguous holds remain held if not found.
    const sessions = stripe.checkout.sessions.list({ limit: 100, created: {
      gte: Math.floor(created / 1000) - 60,
      lte: Math.ceil(Math.max(deadline, created + 24 * 3600000) / 1000),
    } })
    let scanned = 0
    for await (const candidate of sessions) {
      if (candidate.metadata?.physical_edition_hold_id === hold.id &&
          candidate.metadata?.user_id === hold.buyer_user_id &&
          candidate.metadata?.physical_edition_checkout === 'v1' && candidate.mode === 'payment') {
        session = candidate
        break
      }
      if (++scanned >= 1000) break
    }
    if (!session) return hold
  }
  const bound = { ...hold, stripe_session_id: session.id }
  verifySession(bound, session, hold.buyer_user_id)
  await rpc(db, 'bind_physical_edition_checkout_session', { _hold: hold.id, _session: session.id })
  await bindShipping(db, session, hold.stripe_create_params || session)
  return bound
}

export async function reconcilePhysicalHold({ db, stripe, buyer, hold, cancel = false, bindShipping, now = Date.now() }) {
  if (hold.buyer_user_id !== buyer) throw new Error('edition_forbidden')
  let current = hold
  const result = {
    artwork: hold.artwork, reservationStatus: hold.status, unit: hold.unit,
    sessionStatus: null, expiresAt: null, resumeUrl: null,
    canCancel: false, canStartNew: false, state: 'unresolved', orderId: hold.order_id || null,
  }
  if (hold.status !== 'HELD') {
    result.state = hold.status === 'PAID' ? 'paid' : hold.status.toLowerCase()
    result.canStartNew = ['EXPIRED', 'CANCELLED'].includes(hold.status)
    return result
  }
  if (!hold.stripe_session_id && hold.creation_state === 'READY') {
    if (!cancel && Date.parse(hold.expires_at) > now) return { ...result, state: 'preparing', canCancel: true }
    // The prepare RPC and this cancellation lock the same hold. Once a Stripe
    // request can be in flight, cancellation refuses to use the unbound path.
    const released = await rpc(db, 'cancel_unbound_physical_edition_hold', { _hold: hold.id, _buyer: buyer })
    if (!released) throw new Error('edition_status_changed')
    return { ...result, state: 'cancelled', reservationStatus: 'CANCELLED',
      unit: { ...hold.unit, status: 'AVAILABLE' }, canStartNew: true }
  }
  if (!hold.stripe_session_id) {
    current = await recoverPhysicalSession(db, stripe, hold, bindShipping, now)
    if (!current.stripe_session_id) return result
  }
  let session = await stripe.checkout.sessions.retrieve(current.stripe_session_id, { expand: ['payment_intent'] })
  verifySession(current, session, buyer)
  if (session.metadata?.jbu_shipping_checkout) {
    // Repair a lost shipping-bind response before exposing the resume URL.
    await bindShipping(db, session, current.stripe_create_params || session)
  }
  if (cancel && session.status === 'open' && session.payment_status === 'unpaid') {
    try {
      await stripe.checkout.sessions.expire(session.id, {}, { idempotencyKey: `jbu-physical-cancel-${hold.id}` })
    } catch {
      // Completion may win the race. Always reread, never infer expiration
      // from either a successful expire call or its error.
    }
    session = await stripe.checkout.sessions.retrieve(session.id, { expand: ['payment_intent'] })
    verifySession(current, session, buyer)
  }
  let intent = session.payment_intent
  if (typeof intent === 'string') intent = await stripe.paymentIntents.retrieve(intent)
  result.sessionStatus = session.status
  result.expiresAt = session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required' || intent?.status === 'succeeded') {
    return { ...result, state: 'paid_pending_fulfillment' }
  }
  if (session.status === 'expired' && session.payment_status === 'unpaid') {
    // A failed/unconfirmed PaymentIntent must be terminal before releasing its
    // numbered unit. Processing/action-required/unknown states remain held.
    if (intent && ['requires_payment_method', 'requires_confirmation'].includes(intent.status)) {
      await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `jbu-physical-intent-cancel-${hold.id}` })
      intent = await stripe.paymentIntents.retrieve(intent.id)
    }
    if (!intent || intent.status === 'canceled') {
      await rpc(db, 'expire_physical_edition_checkout_hold', { _hold: hold.id, _session: session.id })
      // Readback also handles an idempotent false response and concurrent webhook
      // fulfillment. Do not advertise inventory release without persisted proof.
      const { data: persisted, error } = await db.from('physical_edition_checkout_holds')
        .select('status,order_id').eq('id', hold.id).eq('buyer_user_id', buyer).single()
      if (error || !persisted) throw new Error('edition_reconciliation_failed')
      if (persisted.status === 'PAID') return { ...result, state: 'paid', reservationStatus: 'PAID', orderId: persisted.order_id }
      if (!['EXPIRED', 'CANCELLED'].includes(persisted.status)) throw new Error('edition_reconciliation_failed')
      return { ...result, state: persisted.status.toLowerCase(), reservationStatus: persisted.status,
        unit: { ...hold.unit, status: 'AVAILABLE' }, canStartNew: true }
    }
  }
  const open = session.status === 'open' && session.payment_status === 'unpaid' &&
    (!intent || ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status))
  if (open && session.url && session.expires_at * 1000 > now) {
    // URL comes only from Stripe, with the original quote, country and currency.
    return { ...result, state: 'open', resumeUrl: session.url, canCancel: true }
  }
  return { ...result, state: session.status === 'complete' || intent?.status === 'processing' ? 'processing' : 'unresolved' }
}
