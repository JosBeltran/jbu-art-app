import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'

const uuid = z.uuid()

export const guestCookie = 'jbu_digital_access'
export const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
export const json = (body, status = 200) => Response.json(body, { status, headers: noStore })
export const digest = value => createHash('sha256').update(value).digest('hex')
export const newCapability = () => randomBytes(32).toString('hex')
export const digitalAdminEnabled = () => process.env.ENABLE_DIGITAL_DOWNLOADS_ADMIN === 'true'
export const digitalCheckoutEnabled = () => process.env.ENABLE_DIGITAL_DOWNLOADS_CHECKOUT === 'true'
export const digitalSandboxKey = key => /^(sk|rk)_test_/.test(key || '')

export async function fulfillDigitalCheckout(event, db) {
  const session = event.data.object
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
    return { received: true }
  }
  if (session.payment_status !== 'paid') return { received: true, unpaid: true }

  const purchase = session.metadata.digital_purchase_id
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (session.livemode !== false || session.mode !== 'payment' || session.status !== 'complete' ||
      !uuid.safeParse(purchase).success || !intent || !Number.isInteger(session.amount_total) ||
      session.amount_total < 1 || !['mxn', 'usd'].includes(session.currency)) {
    throw new Error('invalid_digital_payment')
  }
  const { data, error } = await db.rpc('fulfill_digital_art_purchase', {
    _purchase: purchase, _session: session.id, _intent: intent,
    _currency: session.currency.toUpperCase(), _amount: session.amount_total,
  })
  if (error || data !== true) throw new Error('digital_fulfillment_failed')
  return { received: true, digital: true }
}
