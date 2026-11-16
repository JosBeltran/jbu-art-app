import { validateShippingPayment } from './shippingPayment.js'

// Called only after signature verification and confirmed payment, before any RPC
// can reserve inventory or assign ownership. Historical sessions remain supported.
export async function validateSessionShipping(db, stripe, session) {
  const id = session.metadata?.jbu_shipping_checkout
  if (!id) {
    if (Number(session.total_details?.amount_shipping || 0) !== 0)
      throw new Error('shipping_manifest_missing')
    return session
  }
  const result = await db
    .from('shipping_checkouts')
    .select('*')
    .eq('id', id)
    .single()
  if (result.error) throw new Error('shipping_manifest_missing')
  const rateId = session.shipping_cost?.shipping_rate
  const rate =
    typeof rateId === 'string'
      ? await stripe.shippingRates.retrieve(rateId)
      : rateId
  const lines = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  })
  if (
    lines.has_more ||
    !lines.data?.length ||
    lines.data.some(
      (line) =>
        line.currency !== session.currency ||
        !Number.isSafeInteger(line.amount_total)
    ) ||
    lines.data.reduce((sum, line) => sum + line.amount_total, 0) +
      session.total_details.amount_shipping !==
      session.amount_total
  )
    throw new Error('shipping_order_total_mismatch')
  const snapshot = validateShippingPayment(session, result.data, rate)
  const saved = await db
    .from('shipping_checkouts')
    .update({ selected_snapshot: snapshot })
    .eq('id', id)
    .eq('stripe_session_id', session.id)
    .select('id')
    .single()
  if (saved.error || !saved.data)
    throw new Error('shipping_snapshot_save_failed')
  // Existing RPCs validate product amounts. An INSERT trigger adds shipping and
  // freezes the snapshot in their inventory transaction, once per order.
  return { ...session, amount_total: session.amount_total - snapshot.amount }
}
