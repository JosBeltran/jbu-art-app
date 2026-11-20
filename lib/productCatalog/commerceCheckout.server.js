import 'server-only'
import { loadFineArtVariants } from './commerce.server.js'
import { fineArtCurrencies, fineArtLineType, marketVariant, validCatalogCartLine, isCommerceId, verifiedFineArtLines } from './commerce.js'
import { loadShippingSettings } from '../shippingSettings.server.js'
import { checkoutDestination } from '../market.js'
import { prepareCheckoutShipping, bindCheckoutShipping, shippingIntegrationIdentifier } from '../checkoutShipping.server.js'
import { checked } from './service.js'

export class CatalogCheckoutError extends Error {
  constructor(code, status=409) { super(code); this.status = status }
}

export async function startFineArtCheckout(db, stripe, request, body, user, charge) {
  const cart = body.cartItems
  if (!cart.every(item => item.type === fineArtLineType && validCatalogCartLine(item)) ||
      new Set(cart.map(item => item.variantId)).size !== cart.length)
    throw new CatalogCheckoutError('catalog_checkout_separate_cart')
  const country = checkoutDestination(body,request.headers.get('cookie'))
  const currency = body.currency
  if (!country || !fineArtCurrencies.includes(currency) || charge.currency !== currency ||
    cart.some(item => item.destination !== country || item.currency !== currency))
    throw new CatalogCheckoutError('catalog_checkout_market_changed')
  const config = await loadShippingSettings(db)
  const variants = await loadFineArtVariants(db,config,{ variantIds:cart.map(item => item.variantId) })
  const indexed = new Map(variants.map(variant => [variant.id,variant]))
  const shippingItems = []
  const snapshots = cart.map(item => {
    const variant = indexed.get(item.variantId)
    const price = variant && marketVariant(variant,country,currency)
    if (!price || variant.artworkId !== item.id) throw new CatalogCheckoutError('catalog_variant_unavailable')
    if (item.amountMinor !== price.amountMinor) throw new CatalogCheckoutError('catalog_price_changed')
    shippingItems.push({ type:fineArtLineType, quantity:item.quantity, allowed_shipping_countries:[country], artwork:variant.artworkShipping })
    return {
      artworkId:variant.artworkId, artworkSku:variant.artworkSku, artworkTitle:variant.artworkTitle,
      productId:variant.productId, productFamily:variant.productFamily, title:variant.title, titleEn:variant.titleEn, variantId:variant.id, sku:variant.sku,
      variantTitle:variant.variantTitle, attributes:variant.attributes,supplierConfiguration:variant.supplierConfiguration,
      image:variant.gallery[0].url, priceBookId:price.bookId, priceEntryId:price.entryId,
      quantity:item.quantity, amountMinor:price.amountMinor, country, currency,
    }
  })
  const shipping = await prepareCheckoutShipping(db,shippingItems,request,{ ...body,destination:country },charge)
  if (!shipping.metadata || shipping.shipping_address_collection.allowed_countries.length !== 1 ||
      shipping.shipping_address_collection.allowed_countries[0] !== country) throw new CatalogCheckoutError('catalog_checkout_market_changed')
  const checkout = await checked(db.from('fine_art_checkouts').insert({ buyer_id:user.id,country,currency,lines:snapshots }).select('id').single())
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const session = await stripe.checkout.sessions.create({
    mode:'payment', ...shipping, integration_identifier:shippingIntegrationIdentifier(),
    success_url:site + '/checkout/success?session_id={CHECKOUT_SESSION_ID}&print_cart=1&catalog_cart=1',
    cancel_url:site + '/cart',
    line_items:snapshots.map(item => ({
      quantity:item.quantity, price_data:{ currency:currency.toLowerCase(),unit_amount:item.amountMinor,
        product_data:{ name:item.title, description:item.variantTitle || undefined,
          images:item.image.startsWith('https://') ? [item.image] : [],
          metadata:{ catalog_variant_id:item.variantId } },
      },
    })),
    metadata:{ ...shipping.metadata, fine_art_checkout:checkout.id, charge_currency:currency,
      ...(charge.usdPerMxn ? { fx_usd_per_mxn:String(charge.usdPerMxn) } : {}) },
  }, { idempotencyKey:'jbu-catalog-' + checkout.id })
  try {
    await bindCheckoutShipping(db,session,shipping)
    await checked(db.from('fine_art_checkouts').update({ stripe_session_id:session.id }).eq('id',checkout.id)
      .is('stripe_session_id',null).select('id').single())
  } catch (error) {
    await stripe.checkout.sessions.expire(session.id).catch(() => {})
    throw error
  }
  return session.url
}

export async function completeFineArtCheckout(db,stripe,eventSession,shippingValidated) {
  const id = eventSession.metadata.fine_art_checkout
  const currency = String(eventSession.currency).toUpperCase()
  const fx = currency === 'USD' ? Number(eventSession.metadata.fx_usd_per_mxn) : null
  if (!isCommerceId(id) || !fineArtCurrencies.includes(currency) || eventSession.metadata.charge_currency !== currency ||
    (currency === 'USD' && (!Number.isFinite(fx) || fx <= 0))) throw new Error('fine_art_invalid_payment')
  const result = await stripe.checkout.sessions.listLineItems(eventSession.id,{limit:31,expand:['data.price.product']})
  if (result.has_more || !result.data.length || result.data.length > 30) throw new Error('fine_art_amount_mismatch')
  const paidLines = verifiedFineArtLines(result.data,shippingValidated.amount_total)
  const shipping = eventSession.collected_information?.shipping_details?.address || eventSession.shipping_details?.address || {}
  const purchase = await checked(db.rpc('fulfill_fine_art_checkout',{
    _checkout:id,_session:eventSession.id,_intent:typeof eventSession.payment_intent === 'string' ? eventSession.payment_intent : eventSession.payment_intent?.id || null,
    _email:eventSession.customer_details?.email || eventSession.customer_email,_name:eventSession.customer_details?.name || null,
    _phone:eventSession.customer_details?.phone || null,_shipping:shipping,
    _total_mxn:Math.round(shippingValidated.amount_total / (fx || 1)) / 100,
    _currency:currency,_amount_minor:eventSession.amount_total,_fx:fx,_paid_lines:paidLines,
  }))
  return { ...purchase, items:result.data.map(line=>({title:line.description || 'Fine Art Print',sku:''})) }
}
