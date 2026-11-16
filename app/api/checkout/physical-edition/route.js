import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { prepareCheckoutShipping, bindCheckoutShipping, shippingIntegrationIdentifier, shippingErrorStatus, sessionHasShipping } from '@/lib/checkoutShipping.server'
import { serviceClient, getRequestUser } from '@/lib/offersAuth'
import { resolveCheckoutCurrency, unitAmountFor, chargeMetadata } from '@/lib/checkoutCurrency.server'

export const dynamic = 'force-dynamic'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const noStore = { 'Cache-Control': 'no-store' }

// One numbered unit is reserved by the dedicated inventory RPC.
export async function POST(request) {
  const db = serviceClient()
  let holdId = null
  let userId = null
  let attemptedStripeCreation = false
  try {
    const user = await getRequestUser(request, db)
    if (!user?.id || !user.email_confirmed_at) {
      return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: noStore })
    }
    userId = user.id
    const body = await request.json()
    if (!uuid.test(String(body?.artworkId || '')) || !uuid.test(String(body?.requestKey || ''))) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400, headers: noStore })
    }
    const { data: art, error: artworkError } = await db.from('artworks')
      .select('id,title,sku,primary_image_url,physical_edition_type,allowed_shipping_countries,shipping_policy_ids')
      .eq('id', body.artworkId).single()
    if (artworkError || !art || art.physical_edition_type !== 'LIMITED_EDITION') {
      throw new Error('edition_artwork_unavailable')
    }
    const charge = await resolveCheckoutCurrency(request, body.currency)
    const shipping = await prepareCheckoutShipping(db, [{ ...art, type: 'ORIGINAL' }], request, body, charge, `physical:${user.id}:${body.requestKey}`)
    const { data: hold, error: reserveError } = await db.rpc('create_physical_edition_checkout_hold', {
      _artwork_id: body.artworkId, _buyer: user.id, _request_key: body.requestKey,
    })
    if (reserveError || !hold?.id) {
      return NextResponse.json({ error: reserveError?.message || 'edition_unavailable' }, { status: 409, headers: noStore })
    }
    holdId = hold.id
    if (hold.stripe_session_id) {
      // Idempotent return for a retried POST after the Stripe session was bound.
      const existing = await new Stripe(process.env.STRIPE_SECRET_KEY).checkout.sessions.retrieve(hold.stripe_session_id)
      if (existing.status === 'open' && existing.url && sessionHasShipping(existing, shipping)) {
        await bindCheckoutShipping(db, existing, shipping)
        return NextResponse.json({ url: existing.url }, { headers: noStore })
      }
      return NextResponse.json({ error: 'checkout_session_not_open' }, { status: 409, headers: noStore })
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const amountMxn = Number(hold.amount_mxn)
    if (!Number.isFinite(amountMxn) || amountMxn <= 0) throw new Error('invalid_edition_price')
    const image = art.primary_image_url
    const imageUrl = image?.startsWith('https://') ? image : null
    // Stripe Checkout expires after 31 minutes (its minimum is 30 minutes).
    // A 35-minute DB hold allows time for verified expiry webhooks.
    // Never return test-mode buyers from a Vercel Preview to production.
    const siteUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.josuebeltranuresti.com')
    attemptedStripeCreation = true
    const created = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      expires_at: hold.expires_at ? Math.floor(Date.parse(hold.expires_at) / 1000) - 4 * 60 : Math.floor(Date.now() / 1000) + 31 * 60,
      line_items: [{
        price_data: {
          currency: charge.currency.toLowerCase(),
          product_data: {
            name: art.title,
            description: `Physical limited edition — ${art.sku}`,
            images: imageUrl ? [imageUrl] : [],
          },
          unit_amount: unitAmountFor(amountMxn, charge),
        },
        quantity: 1,
      }],
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&physical_edition=1`,
      cancel_url: `${siteUrl}/artwork/${encodeURIComponent(art.sku)}?canceled=true`,
      ...shipping,
      integration_identifier: shippingIntegrationIdentifier(hold.id),
      metadata: {
        ...shipping.metadata,
        physical_edition_checkout: 'v1',
        physical_edition_hold_id: hold.id,
        user_id: user.id,
        ...chargeMetadata(charge),
        mxn_units: JSON.stringify([amountMxn]),
      },
    }, { idempotencyKey: `jbu-physical-edition-${hold.id}` })
    const { error: bindError } = await db.rpc('bind_physical_edition_checkout_session', {
      _hold: hold.id, _session: created.id,
    })
    if (bindError) throw new Error('edition_session_binding_failed')
    try {
      await bindCheckoutShipping(db, created, shipping)
    } catch (error) {
      await stripe.checkout.sessions.expire(created.id)
      throw error
    }
    return NextResponse.json({ url: created.url }, { headers: noStore })
  } catch (error) {
    if (holdId && !attemptedStripeCreation) {
      await db.rpc('cancel_unbound_physical_edition_hold', { _hold: holdId, _buyer: userId })
    }
    // A Stripe request may have succeeded even if this handler missed its response.
    // Leave the reservation for an idempotent retry or verified reconciliation.
    console.error('[physical-edition] checkout unavailable', { code: error?.message, holdId })
    return NextResponse.json({ countries:error.countries, error: shippingErrorStatus(error) ? error.message : 'edition_checkout_unavailable' }, { status: shippingErrorStatus(error) || 503, headers: noStore })
  }
}
