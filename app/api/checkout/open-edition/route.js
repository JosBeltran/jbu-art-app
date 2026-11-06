import Stripe from 'stripe'
import { randomBytes, createHash } from 'node:crypto'
import { serviceClient, getRequestUser } from '@/lib/offersAuth'
import { selectPrintRows } from '@/lib/guestPrintCart'
import { resolveCheckoutCurrency, unitAmountFor, chargeMetadata } from '@/lib/checkoutCurrency.server'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Isolated print-only flow. No alteration to original/auction/offer/edition checkout.
// Deliberate opt-in until the fulfillment migration and webhook can be tested in staging.
export async function POST(request) {
  if (process.env.ENABLE_GUEST_OPEN_EDITION_CHECKOUT !== 'true')
    return Response.json({ error: 'Open Edition guest checkout is not enabled' }, { status: 503 })
  try {
    const body = await request.json()
    if (!Array.isArray(body?.cartItems) || !body.cartItems.length || body.cartItems.length > 20)
      return Response.json({ error: 'invalid_cart' }, { status: 400 })
    if (body.cartItems.some(i =>
      String(i.type || i.item_type).toUpperCase() !== 'PRINT' ||
      !UUID.test(i.id || i.artwork_id || '') || !UUID.test(i.variantId || i.variant_id || '') ||
      !Number.isInteger(Number(i.quantity || 1)) || Number(i.quantity || 1) < 1 || Number(i.quantity || 1) > 100
    )) return Response.json({ error: 'guest_checkout_open_prints_only' }, { status: 400 })
    const db = serviceClient()
    const buyer = await getRequestUser(request, db)
    const variantsIds = [...new Set(body.cartItems.map(i => i.variantId || i.variant_id))]
    if (variantsIds.length !== body.cartItems.length)
      return Response.json({ error: 'duplicate_print_variant' }, { status: 400 })
    const { data: variants, error } = await db.from('artwork_prints')
      .select('id,artwork_id,price,size,finish,is_active,edition_type')
      .in('id', variantsIds)
    if (error) throw error
    const resolved = selectPrintRows(variants || [], body.cartItems)
    const artIds = [...new Set(resolved.map(v => v.artwork_id))]
    const { data: artworks, error: artworkError } = await db.from('artworks_discoverable')
      .select('id,sku,title,primary_image_url').in('id', artIds)
    if (artworkError) throw artworkError
    const byArtwork = new Map(artworks.map(a => [a.id, a]))
    if (byArtwork.size !== artIds.length) return Response.json({ error: 'artwork_not_found' }, { status: 400 })
    const charge = await resolveCheckoutCurrency(request, body.currency)
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const snapshots = resolved.map(v => {
      const a = byArtwork.get(v.artwork_id)
      return { artwork_id: a.id, variant_id: v.id, sku: a.sku,
        title: a.title, size: v.size, finish: v.finish, quantity: v.quantity, unit_mxn: v.priceMxn }
    })
    const guestToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(guestToken).digest('hex')
    const { data: checkout, error: checkoutError } = await db.from('guest_open_print_checkouts')
      .insert({ items: snapshots, buyer_user_id: buyer?.id || null, token_hash: tokenHash })
      .select('id').single()
    if (checkoutError || !checkout?.id) throw checkoutError || new Error('checkout_record_failed')
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    let session
    try {
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      ...(buyer?.email ? { customer_email: buyer.email } : {}),
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      shipping_address_collection: { allowed_countries: ['MX','US','CA'] },
      line_items: resolved.map(v => {
        const a = byArtwork.get(v.artwork_id)
        return { quantity: v.quantity, price_data: {
          currency: charge.currency.toLowerCase(),
          unit_amount: unitAmountFor(v.priceMxn, charge),
          product_data: { name: a.title + ' · Open Edition', description: v.size + ' · ' + v.finish }
        } }
      }),
      success_url: site + '/checkout/success?guest_print=1&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: site + '/cart?canceled=true',
      metadata: {
        guest_open_prints: 'v1',
        guest_checkout_id: checkout.id,
        guest_order_token: guestToken,
        ...chargeMetadata(charge),
        mxn_units: JSON.stringify(resolved.map(v => v.priceMxn)),
      },
      }, { idempotencyKey: `guest-open-print/${checkout.id}` })
      const saved = await db.from('guest_open_print_checkouts')
        .update({ stripe_session_id: session.id }).eq('id', checkout.id).is('stripe_session_id', null).select('id').single()
      if (saved.error || !saved.data) throw saved.error || new Error('checkout_session_binding_failed')
    } catch (error) {
      if (session?.id) await stripe.checkout.sessions.expire(session.id).catch(() => {})
      console.error('[open-prints] session preparation failed', { checkout: checkout.id, reason: error?.message })
      return Response.json({ error: 'checkout_preparation_failed' }, { status: 500 })
    }
    // Checkout access token is delivered only to the initiating browser and buyer email.
    // Never reveal this token from a session_id-only public status lookup.
    return Response.json({ url: session.url, session_id: session.id, guest_access_token: guestToken }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[open-prints] checkout creation failed', { reason: error?.message })
    return Response.json({ error: 'open_print_checkout_failed' }, { status: 500 })
  }
}
