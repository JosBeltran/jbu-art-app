import Stripe from 'stripe'
import { serviceClient } from '@/lib/offersAuth'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'no-store' }
export async function GET(request) {
  if (process.env.ENABLE_GUEST_OPEN_EDITION_CHECKOUT !== 'true')
    return Response.json({ status: 'unavailable' }, { status: 503, headers: noStore })
  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId || ''))
    return Response.json({ status: 'invalid' }, { status: 400, headers: noStore })
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.metadata?.guest_open_prints !== 'v1' ||
      session.mode !== 'payment' || session.payment_status !== 'paid')
      return Response.json({ status: 'pending' }, { headers: noStore })
    const db = serviceClient()
    const { data, error } = await db.from('guest_open_print_checkouts').select('order_id')
      .eq('id', session.metadata.guest_checkout_id).eq('stripe_session_id', session.id).maybeSingle()
    if (error) throw error
    if (!data?.order_id) return Response.json({ status: 'processing' }, { headers: noStore })
    const token = session.metadata.guest_order_token
    if (!/^[a-f0-9]{64}$/.test(token || '')) throw new Error('missing_access_token')
    return Response.json({ status: 'paid', order_url: '/guest-orders/' + token }, { headers: noStore })
  } catch (error) {
    console.error('[guest-prints] status query failed', { reason: error?.message })
    return Response.json({ status: 'unavailable' }, { status: 503, headers: noStore })
  }
}
