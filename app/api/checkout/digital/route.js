import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/offersAuth'
import { serviceClient } from '@/lib/certificates/adminAuth.server'
import { uuid } from '@/lib/digitalDownloads/validation'
import { digitalCheckoutEnabled, digitalSandboxKey, digest, guestCookie, json, newCapability, noStore } from '@/lib/digitalDownloads/commerce'

function checkoutOrigin() {
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000')
  if (site.protocol !== 'https:' &&
      !(site.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(site.hostname))) {
    throw new Error('invalid_checkout_origin')
  }
  return site.origin
}

export async function POST(request) {
  const key = process.env.STRIPE_SECRET_KEY
  if (!digitalCheckoutEnabled() || !digitalSandboxKey(key)) return json({ error: 'disabled' }, 404)
  const body = await request.json().catch(() => null)
  if (!uuid.safeParse(body?.variantId).success) return json({ error: 'invalid_variant' }, 400)

  let stripe
  let session
  try {
    const site = checkoutOrigin()
    if (new URL(request.url).origin !== site) return json({ error: 'invalid_checkout_origin' }, 400)
    const db = serviceClient()
    const buyer = await getRequestUser(request, db)
    const guestSecret = buyer ? null : newCapability()
    const { data: purchase, error } = await db.rpc('prepare_digital_art_purchase', {
      _variant: body.variantId, _buyer: buyer?.id || null,
      _guest_hash: guestSecret ? digest(guestSecret) : null,
    }).maybeSingle()
    if (error) throw error
    if (!purchase) return json({ error: 'variant_unavailable' }, 404)

    stripe = new Stripe(key)
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      integration_identifier: 'jbu_digital_art_pqmezyhc',
      adaptive_pricing: { enabled: false },
      ...(buyer?.email ? { customer_email: buyer.email } : {}),
      line_items: [{ quantity: 1, price_data: {
        currency: purchase.currency.toLowerCase(),
        unit_amount: purchase.amount_minor,
        product_data: { name: `${purchase.artwork_title} · Digital download (${purchase.size})` },
      } }],
      success_url: `${site}/checkout/digital/${purchase.id}`,
      cancel_url: `${site}/catalog`,
      metadata: { digital_art_download: 'v1', digital_purchase_id: purchase.id },
    }, { idempotencyKey: `digital-art/${purchase.id}` })
    if (session.livemode !== false || !session.url) throw new Error('invalid_checkout_session')

    const bound = await db.from('digital_art_purchases').update({ stripe_session_id: session.id })
      .eq('id', purchase.id).is('stripe_session_id', null).select('id').single()
    if (bound.error || !bound.data) throw bound.error || new Error('checkout_binding_failed')
    const response = NextResponse.json({ url: session.url }, { headers: noStore })
    if (guestSecret) {
      response.cookies.set(guestCookie, guestSecret, {
        httpOnly: true, secure: site.startsWith('https:'), sameSite: 'lax',
        path: `/api/digital-downloads/${purchase.id}`, maxAge: 60 * 60 * 24 * 30,
      })
    }
    return response
  } catch (error) {
    if (session?.id) await stripe.checkout.sessions.expire(session.id).catch(() => {})
    console.error('[digital-checkout] preparation failed', { code: error?.code })
    return json({ error: 'checkout_preparation_failed' }, 500)
  }
}
