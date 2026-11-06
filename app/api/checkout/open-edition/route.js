import Stripe from 'stripe'
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
    const { data: artworks, error: artworkError } = await db.from('artworks')
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
    // Stripe metadata limits: fail rather than truncate order snapshots.
    const serialized = JSON.stringify(snapshots)
    if (serialized.length > 490) return Response.json({ error: 'too_many_print_variants_for_checkout' }, { status: 400 })
    const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const session = await stripe.checkout.sessions.create({
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
      success_url: site + '/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: site + '/cart?canceled=true',
      metadata: {
        guest_open_prints: 'v1',
        user_id: buyer?.id || '',
        print_items: serialized,
        ...chargeMetadata(charge),
        mxn_units: JSON.stringify(resolved.map(v => v.priceMxn)),
      },
    })
    return Response.json({ url: session.url })
  } catch (error) {
    console.error('[open-prints] checkout creation failed', { reason: error?.message })
    return Response.json({ error: 'open_print_checkout_failed' }, { status: 500 })
  }
}
