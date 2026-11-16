import Stripe from 'stripe'
import { serviceClient } from '@/lib/offersAuth'
import { bindCheckoutShipping } from '@/lib/checkoutShipping.server'
import { physicalEditionStatus } from '@/lib/physicalEditionRecovery.http'

export const dynamic = 'force-dynamic'

function status(request, cancel) {
  return physicalEditionStatus(request, {
    db: serviceClient(), stripe: new Stripe(process.env.STRIPE_SECRET_KEY),
    bindShipping: bindCheckoutShipping, cancel,
  })
}

// Reconciles verified expired sessions when expiration webhooks are delayed.
// Merely visiting Stripe's cancel URL never requests cancellation.
export async function GET(request) { return status(request, false) }
export async function POST(request) { return status(request, true) }
