// Run: node --experimental-vm-modules --test tests/checkoutShipping.test.mjs
// Exercise the real route handlers with in-memory DB/Stripe boundaries. No API
// keys, network requests or charges. Shared shipping/pricing validation is real.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import * as shipping from '../lib/checkoutShipping.server.js'
import * as printCart from '../lib/guestPrintCart.js'
import * as availability from '../lib/catalogPrintAvailability.js'

const a = '10000000-0000-4000-8000-000000000001'
const b = '10000000-0000-4000-8000-000000000002'
const v = '20000000-0000-4000-8000-000000000001'
const w = '20000000-0000-4000-8000-000000000002'
const buyer = { id: '30000000-0000-4000-8000-000000000001', email: 'buyer@example.test', email_confirmed_at: '2026-01-01' }
const art = (id = a, countries = null) => ({ id, title: 'Original', sku: id, status: 'AVAILABLE', base_price_mxn: 1000, allowed_shipping_countries: countries })
const variant = (id = v, parent = a, countries = ['GB'], edition = 'OPEN') => ({ id, artwork_id: parent, title: 'Print', size: 'A3', finish: 'FINE_ART', is_active: true, price: 200, edition_type: edition, max_edition_size: 10, prints_sold: 0, allowed_shipping_countries: countries })
const item = (id = a, variantId = v) => ({ id, variantId, type: 'PRINT', quantity: 1, price: 1, allowed_shipping_countries: ['US'] })

async function loadRoute(path, { arts = [art()], variants = [variant()], user = buyer, existingSession, auctions = [] } = {}) {
  const calls = { sessions: [], checkouts: [], rpcs: [] }
  const db = { from(table) {
    let data = table === 'artworks' ? arts : table === 'artwork_prints' ? variants : table === 'auctions' ? auctions : []
    let single = false
    const q = {
      select() { return q },
      in(key, values) { data = data.filter(row => values.includes(row[key])); return q },
      eq(key, value) { data = data.filter(row => row[key] === value); return q },
      is() { return q }, gt() { return q }, limit() { return q }, or() { return q },
      single() { single = true; return q }, maybeSingle() { single = true; return q },
      insert(row) { calls.checkouts.push(row); data = [{ id: 'checkout-1' }]; return q },
      update() { data = [{ id: 'checkout-1' }]; return q },
      then(resolve, reject) { return Promise.resolve({ data: single ? data[0] || null : data, error: null }).then(resolve, reject) },
    }
    return q
  }, async rpc(name) {
    calls.rpcs.push(name)
    return { data: name === 'create_physical_edition_checkout_hold' ? { id: 'hold-1', amount_mxn: 1000, stripe_session_id: existingSession?.id } : true, error: null }
  } }
  class Stripe {
    coupons = { create: async () => ({ id: 'coupon' }) }
    checkout = { sessions: {
      create: async (params, options) => { calls.sessions.push({ params, options }); return { id: 'cs_test', url: 'https://checkout.stripe.test/session' } },
      retrieve: async () => existingSession,
      expire: async () => {},
    } }
  }
  const deps = {
    'next/server': { NextResponse: Response },
    stripe: { default: Stripe },
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/checkoutShipping.server': shipping,
    './checkoutShipping.server.js': shipping,
    '@/lib/payments/pending': { paymentFrom: () => null, paymentState: () => null },
    '@/lib/payments/pending.server': { refreshPayments: async () => {} },
    '@/lib/welcomePromotion.server': { userFromRequest: async () => user, applicablePromotion: async () => null },
    '@/lib/offersAuth': { serviceClient: () => db, getRequestUser: async () => user },
    '@/lib/artworkStatus': { isArtworkPurchasable: () => true },
    '@/lib/checkoutCurrency.server': {
      resolveCheckoutCurrency: async () => ({ currency: 'MXN' }),
      unitAmountFor: amount => Math.round(amount * 100), chargeMetadata: () => ({ charged_currency: 'MXN' }),
    },
    '@/lib/guestPrintCart': printCart,
    '@/lib/printMedia.server': { getPrintMediaMap: async () => ({}) },
    '@/lib/printCheckoutSnapshot.server': { printCheckoutRevisions: async () => new Map() },
    '@/lib/publicPrintDiscovery.server': { getPublicPrintArtworks: async ids => arts.filter(row => ids.includes(row.id)) },
    '@/lib/printImages': { publicPrintImageUrl: () => null, variantImage: () => null },
    '@/lib/catalogPrintAvailability': availability,
  }
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8')
  const mod = new SourceTextModule(source, { identifier: path })
  await mod.link(async specifier => {
    const exports = deps[specifier] || (specifier === 'node:crypto' ? await import('node:crypto') : null)
    assert.ok(exports, 'Missing test boundary: ' + specifier)
    return new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value) })
  })
  await mod.evaluate()
  return { calls, auction: () => mod.namespace.createAuctionCheckout(new Request('http://localhost/api/auction', { method: 'POST', body: '{}' }), v, 'BUY_NOW'), async post(body) {
    return mod.namespace.POST(new Request('http://localhost:3000/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))
  } }
}

// The only environment used is explicit server shipping coverage and the
// pre-existing guest feature flag. Neither is supplied by the browser.
process.env.ENABLE_GUEST_OPEN_EDITION_CHECKOUT = 'true'
process.env.JBU_INCLUDED_SHIPPING_COUNTRIES = 'MX,CA,US,GB'
const registered = 'app/api/checkout/route.js'
const guest = 'app/api/checkout/open-edition/route.js'
const physical = 'app/api/checkout/physical-edition/route.js'

test('registered mixed UK print plus unrestricted original uses DB restrictions and DB pricing', async () => {
  const { post, calls } = await loadRoute(registered, { arts: [art(), art(b)] })
  assert.equal((await post({ cartItems: [item(), { id: b, type: 'original', price: 1, allowed_shipping_countries: ['US'] }], shipping_address_collection: { allowed_countries: ['US'] } })).status, 200)
  const session = calls.sessions[0].params
  assert.deepEqual(session.shipping_address_collection.allowed_countries, ['GB'])
  assert.deepEqual(session.line_items.map(i => i.price_data.unit_amount), [20000, 100000])
  assert.equal(session.metadata.user_id, buyer.id)
  assert.equal(session.metadata.print_cart, 'v1')
  // Existing webhook product snapshots represent both item types in mixed carts.
  assert.deepEqual(session.line_items[1].price_data.product_data.metadata, { artwork_id: b })
})

test('registered incompatible variants cannot be bypassed with forged country lists or type casing', async () => {
  const { post, calls } = await loadRoute(registered, { variants: [variant(), variant(w, a, ['US'])] })
  const response = await post({ cartItems: [item(), { ...item(a, w), type: 'print', allowed_shipping_countries: ['GB'] }], allowed_shipping_countries: ['GB', 'US'] })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error, 'shipping_country_conflict')
  assert.equal(calls.sessions.length, 0)
})

test('unrestricted registered originals retain default countries', async () => {
  const { post, calls } = await loadRoute(registered)
  assert.equal((await post({ cartItems: [{ id: a, type: 'ORIGINAL' }] })).status, 200)
  assert.deepEqual(calls.sessions[0].params.shipping_address_collection.allowed_countries, ['MX', 'CA', 'US'])
})

test('authenticated Limited Edition print checkout remains functional and guest cannot buy limited', async () => {
  const fixture = { variants: [variant(v, a, ['GB'], 'LIMITED')] }
  const auth = await loadRoute(registered, fixture)
  assert.equal((await auth.post({ cartItems: [item()] })).status, 200)
  assert.deepEqual(auth.calls.sessions[0].params.shipping_address_collection.allowed_countries, ['GB'])
  const anonymous = await loadRoute(guest, { ...fixture, user: null })
  assert.notEqual((await anonymous.post({ cartItems: [item()] })).status, 200)
  assert.equal(anonymous.calls.sessions.length, 0)
})

test('guest UK Open Edition keeps token, snapshots, authoritative prices and only GB selector', async () => {
  const { post, calls } = await loadRoute(guest, { user: null })
  const response = await post({ cartItems: [item()], userId: buyer.id, resolvedCountries: ['US'] })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.guest_access_token.length, 64)
  const session = calls.sessions[0].params
  assert.deepEqual(session.shipping_address_collection.allowed_countries, ['GB'])
  assert.equal(session.line_items[0].price_data.unit_amount, 20000)
  assert.equal(calls.checkouts[0].buyer_user_id, null)
  assert.equal(session.metadata.guest_open_prints, 'v1')
  assert.match(session.success_url, /#jbu_access=/)
})

test('guest conflict creates neither Stripe session nor checkout snapshot record', async () => {
  const { post, calls } = await loadRoute(guest, { variants: [variant(), variant(w, a, ['US'])], user: null })
  const response = await post({ cartItems: [item(), item(a, w)] })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error, 'shipping_country_conflict')
  assert.equal(calls.sessions.length, 0)
  assert.equal(calls.checkouts.length, 0)
})

test('unsupported new destination rejects both guest and authenticated checkout before Stripe', async () => {
  for (const route of [guest, registered]) {
    const { post, calls } = await loadRoute(route, { variants: [variant(v, a, ['JP'])] })
    const response = await post({ cartItems: [item()], JBU_INCLUDED_SHIPPING_COUNTRIES: 'JP' })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error, 'shipping_configuration_unavailable')
    assert.equal(calls.sessions.length, 0)
    assert.equal(calls.checkouts.length, 0)
  }
})

test('numbered physical editions enforce DB restrictions before reserving or reusing sessions', async () => {
  const fixture = { arts: [{ ...art(a, ['GB']), physical_edition_type: 'LIMITED_EDITION' }] }
  const { post, calls } = await loadRoute(physical, fixture)
  assert.equal((await post({ artworkId: a, requestKey: v, allowed_shipping_countries: ['US'] })).status, 200)
  assert.deepEqual(calls.sessions[0].params.shipping_address_collection.allowed_countries, ['GB'])
  const retry = await loadRoute(physical, { ...fixture, existingSession: { id: 'cs_old', status: 'open', url: 'https://old.test', shipping_address_collection: { allowed_countries: ['US'] } } })
  assert.equal((await retry.post({ artworkId: a, requestKey: v })).status, 409)
  const unsupported = await loadRoute(physical, { arts: [{ ...art(a, ['JP']), physical_edition_type: 'LIMITED_EDITION' }] })
  assert.equal((await unsupported.post({ artworkId: a, requestKey: v })).status, 503)
  assert.equal(unsupported.calls.rpcs.length, 0)
})

test('guest cannot forge identity to enter authenticated checkout', async () => {
  const { post, calls } = await loadRoute(registered, { user: null })
  assert.equal((await post({ userId: buyer.id, cartItems: [item()] })).status, 401)
  assert.equal(calls.sessions.length, 0)
})


test('auction Buy Now retains server pricing and applies original shipping restrictions', async () => {
  const { auction, calls } = await loadRoute('lib/auctionCheckout.server.js', {
    arts: [art(a, ['GB'])], auctions: [{ id: v, artwork_id: a, status: 'LIVE', buy_now_price: 900,
      ends_at: '2099-01-01T00:00:00Z', starts_at: '2020-01-01T00:00:00Z' }],
  })
  assert.equal((await auction()).status, 200)
  assert.deepEqual(calls.sessions[0].params.shipping_address_collection.allowed_countries, ['GB'])
  assert.equal(calls.sessions[0].params.line_items[0].price_data.unit_amount, 90000)
})

test('existing digital points checkout still omits shipping address collection', async () => {
  const { post, calls } = await loadRoute('app/api/checkout/points/route.js')
  const response = await post({ artworkId: a, artworkSku: 'ART', userId: buyer.id, pointsAmount: 500,
    allowed_shipping_countries: ['GB'], shipping_address_collection: { allowed_countries: ['GB'] } })
  assert.equal(response.status, 200)
  assert.equal(calls.sessions[0].params.shipping_address_collection, undefined)
})
