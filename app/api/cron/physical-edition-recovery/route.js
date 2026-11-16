import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { serviceClient } from '@/lib/offersAuth'
import { bindCheckoutShipping } from '@/lib/checkoutShipping.server'
import { physicalCheckoutSelect, reconcilePhysicalHold } from '@/lib/physicalEditionRecovery.server'

export const dynamic = 'force-dynamic'

// Opt-in scheduled reconciliation. No job is enabled by migration/deployment.
// Rotate past unresolved holds so one old ambiguous request cannot starve others.
export async function POST(request) {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : ''
  const supplied = request.headers.get('authorization') || ''
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const db = serviceClient()
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const { data: holds, error } = await db.from('physical_edition_checkout_holds').select(physicalCheckoutSelect)
      .eq('status', 'HELD').lte('expires_at', new Date().toISOString())
      .order('recovery_checked_at', { ascending: true, nullsFirst: true }).limit(25)
    if (error) throw new Error('edition_recovery_query_failed')
    let released = 0
    let unresolved = 0
    for (const hold of holds) {
      try {
        const purchase = await reconcilePhysicalHold({ db, stripe, buyer: hold.buyer_user_id,
          hold, bindShipping: bindCheckoutShipping })
        if (purchase.canStartNew) released++
        else if (!['paid', 'paid_pending_fulfillment'].includes(purchase.state)) unresolved++
      } catch {
        unresolved++
      }
      const { error: stampError } = await db.from('physical_edition_checkout_holds')
        .update({ recovery_checked_at: new Date().toISOString() }).eq('id', hold.id)
      if (stampError) throw new Error('edition_recovery_stamp_failed')
    }
    return NextResponse.json({ checked: holds.length, released, unresolved }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'edition_recovery_unavailable' }, { status: 503 })
  }
}
