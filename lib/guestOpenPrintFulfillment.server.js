import { createClient } from '@supabase/supabase-js'
import { mxnFulfillment } from '@/lib/stripeCharge'
import { unitAmountFor } from '@/lib/checkoutCurrency.server'
import { sendGuestOpenPrintEmail } from '@/lib/emails/guestOpenPrintEmail.server'

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const site = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://www.josuebeltranuresti.com'

export async function processGuestOpenPrintWebhook(event, stripe) {
  const session = event.data.object
  if (event.type !== 'checkout.session.completed') return { received: true }
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return { received: true, unpaid: true }
  const checkoutId = session.metadata?.guest_checkout_id
  if (!/^[0-9a-f-]{36}$/i.test(checkoutId || '')) throw new Error('guest_checkout_invalid')
  const sb = db()
  const { data: checkout, error } = await sb.from('guest_open_print_checkouts').select('*').eq('id', checkoutId).single()
  if (error || !checkout || checkout.stripe_session_id !== session.id) throw new Error('guest_checkout_binding_mismatch')
  const items = checkout.items
  const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })
  if (!Array.isArray(items) || items.length !== lines.data.length || lines.has_more) throw new Error('guest_print_lines_mismatch')
  const charge = mxnFulfillment(session, lines.data)
  let expectedMxn = 0
  for (const [i, item] of items.entries()) {
    const quantity = Number(item.quantity), unit = Number(item.unit_mxn)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity !== Number(lines.data[i].quantity) ||
      !Number.isFinite(unit) || unit <= 0) throw new Error('guest_print_quantity_mismatch')
    const actual = Number(lines.data[i].amount_total)
    const expected = unitAmountFor(unit, { currency: charge.charge.currency.toUpperCase(), usdPerMxn: charge.charge.usdPerMxn }) * quantity
    if (actual !== expected) throw new Error('guest_print_stripe_amount_mismatch')
    expectedMxn += unit * quantity
  }
  if (Math.abs(expectedMxn - charge.total) > 0.01) throw new Error('guest_print_total_mismatch')
  const shipping = session.collected_information?.shipping_details?.address ||
    session.shipping_details?.address || session.customer_details?.address || {}
  const email = session.customer_details?.email || session.customer_email
  const { data: fulfilled, error: rpcError } = await sb.rpc('fulfill_guest_open_print_checkout', {
    _checkout: checkout.id, _session: session.id,
    _intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
    _email: email, _name: session.customer_details?.name || null,
    _phone: session.customer_details?.phone || null,
    _shipping: shipping, _total_mxn: Number(expectedMxn.toFixed(2)),
    _charged_currency: charge.charge.currency.toUpperCase(),
    _charged_amount: Number(session.amount_total) / 100,
    _fx: charge.charge.usdPerMxn || null,
  })
  if (rpcError || !fulfilled?.order_id) throw new Error(rpcError?.message || 'guest_print_fulfillment_failed')

  // Email errors do not roll back paid orders. Failed sends remain queued for
  // operator review/retry, with Resend idempotency preventing duplicate mail.
  const now = new Date().toISOString()
  const { data: claimed, error: claimError } = await sb.from('guest_open_print_checkouts')
    .update({ email_state: 'SENDING', email_lease_until: new Date(Date.now() + 5 * 60_000).toISOString() })
    .eq('id', checkout.id).eq('email_state', 'PENDING')
    .select('id').maybeSingle()
  if (claimError) console.error('[guest-prints] email claim error', { checkout: checkout.id, code: claimError.code })
  if (claimed) {
    try {
      const { data: order } = await sb.from('orders').select('id,charged_currency,charged_amount,total_amount_mxn,shipping_address').eq('id', fulfilled.order_id).single()
      const { data: orderItems } = await sb.from('order_items')
        .select('title_snapshot,quantity,print_size_snapshot,print_finish_snapshot').eq('order_id', fulfilled.order_id)
      if (!order || !orderItems) throw new Error('guest_email_order_read_failed')
      const token = session.metadata?.guest_order_token
      if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('guest_order_token_missing')
      const sent = await sendGuestOpenPrintEmail({
        email, order, items: orderItems, url: site() + '/guest-orders/' + token,
      })
      await sb.from('guest_open_print_checkouts')
        .update(sent.disabled ? { email_state: 'PENDING', email_lease_until: null } : { email_state: 'SENT', email_sent_at: now, email_lease_until: null })
        .eq('id', checkout.id)
    } catch (mailError) {
      console.error('[guest-prints] confirmation email pending manual retry', { checkout: checkout.id, code: mailError.message })
      await sb.from('guest_open_print_checkouts').update({ email_state: 'PENDING', email_lease_until: null }).eq('id', checkout.id)
    }
  }
  return { received: true, guest_open_prints: true, duplicate: Boolean(fulfilled.existing) }
}
