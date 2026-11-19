import assert from 'node:assert/strict'
import test from 'node:test'
import { gelatoAdapter, prodigiAdapter } from './providers.js'
import { resolvePrice, proposePrice, analyzeCompatibility } from './pricing.js'
import { operations } from './contracts.js'

const destination = { country: 'MX', line1: 'Fixture street', city: 'Monterrey', postalCode: '64000' }

test('Gelato sends the documented quote contract and preserves unreported tax', async () => {
  const api = gelatoAdapter('fixture-key', async (url, options) => {
    assert.equal(url, 'https://order.gelatoapis.com/v4/orders:quote')
    assert.equal(options.headers['X-API-Key'], 'fixture-key')
    assert.equal(options.redirect, 'error')
    const body = JSON.parse(options.body)
    assert.deepEqual(body.recipient, { country: 'MX', addressLine1: destination.line1, city: destination.city, postCode: '64000' })
    assert.equal(body.products[0].productUid, 'paper')
    return Response.json({ quotes: [{ products: [{ ...body.products[0], currency: 'MXN', price: 100 }],
      shipmentMethods: [{ currency: 'MXN', shipmentMethodUid: 'standard', price: 30, isPrivate: false }] }] })
  })
  const quote = await api.quote({ variantId: 'paper', destination, currency: 'MXN', quantity: 1 })
  assert.equal(quote.manufacturingMinor, 10000)
  assert.equal(quote.shippingMinor, 3000)
  assert.equal(quote.taxMinor, null)
})

test('Prodigi uses v5 catalogue variant IDs and retains supplier currency', async () => {
  const api = prodigiAdapter('fixture-key', async (url, options) => {
    assert.equal(url, 'https://api.prodigi.com/v5/quotes/order')
    const body = JSON.parse(options.body)
    assert.equal(body.items[0].catalogueVariantId, 'catalogue-variant')
    assert.equal(body.currencyCode, undefined)
    assert.equal(body.shippingAddress.countryCode, 'MX')
    const money = amount => ({ amount, currency: 'USD' })
    return Response.json({ data: { items: money('12.04'), shipping: money('5.00'), tax: money('0.12') } })
  })
  const quote = await api.quote({ variantId: 'catalogue-variant', destination, currency: 'MXN', quantity: 1 })
  assert.deepEqual([quote.currency,quote.manufacturingMinor,quote.shippingMinor,quote.taxMinor], ['USD',1204,500,12])
})

test('rate limits surface without retry and protected calls require explicit confirmation', async () => {
  let attempts = 0
  const api = prodigiAdapter('fixture-key', async () => {
    attempts++
    return new Response(null, { status: 429, headers: { 'Retry-After': '20' } })
  })
  await assert.rejects(api.categories(), { code: 'provider_rate_limited', retryAfter: '20' })
  assert.equal(attempts, 1)
  assert.equal(operations.submitFulfillment.schema.safeParse({ jobId: '10000000-0000-4000-8000-000000000001' }).success, false)
})

test('pricing prefers a country book, rejects ties and excludes reference prices', () => {
  const book = { status: 'active', channel: 'storefront', currency: 'MXN', priority: 0 }
  const variant = { id: 'v', status: 'active', allowed_countries: ['MX'] }
  const books = [{ ...book, id: 'global' }, { ...book, id: 'mx', country: 'MX' }]
  const entries = books.map((b, index) => ({ id: b.id, price_book_id: b.id, status: 'active', product_variant_id: 'v', amount_minor: 100 + index }))
  const input = { books, entries, variant, country: 'MX', currency: 'MXN' }
  assert.equal(resolvePrice(input).amountMinor, 101)
  assert.equal(resolvePrice({ ...input, country: 'US' }).explanation, 'variant_unavailable')
  assert.equal(resolvePrice({ ...input, entries: entries.map(row => ({ ...row, status: 'reference' })) }).explanation, 'no_price')
  assert.equal(resolvePrice({ ...input, entries: [...entries, { ...entries[1], id: 'tie' }] }).explanation, 'ambiguous_price')
})

test('margin calculations require valid landed costs and compatibility needs verified dimensions', () => {
  const now = Date.now()
  const quote = { currency: 'MXN', shippingMinor: 300, manufacturingMinor: 600, taxMinor: 100,
    expiresAt: new Date(now + 60_000).toISOString() }
  const input = { now, quote, currency: 'MXN', policy: { type: 'target_margin', value: 2000 } }
  assert.equal(proposePrice(input).retailMinor, 1250)
  assert.throws(() => proposePrice({ ...input, currency: 'USD' }), /fresh_exchange_rate_required/)
  const asset = { widthPx: 3000, heightPx: 3000 }
  const requirements = { widthMm: 200, heightMm: 200, bleedMm: 3, minimumDpi: 300 }
  assert.equal(analyzeCompatibility(asset, requirements).status, 'requires_validation')
  assert.equal(analyzeCompatibility(asset, { ...requirements, printableAreaVerified: true }).status, 'compatible')
})

test('Gelato discovery uses the catalog UID and finds canvas by its Spanish search term', async () => {
  const api = gelatoAdapter('fixture-key', async (url, options) => {
    if (url.endsWith('/catalogs')) return Response.json([{ catalogUid: 'wall-art', title: 'Wall Art' }])
    assert.equal(url, 'https://product.gelatoapis.com/v3/catalogs/wall-art/products:search')
    assert.deepEqual(JSON.parse(options.body), { limit: 25, offset: 0 })
    return Response.json({ products: [{ productUid: 'canvas_300x400' }, { productUid: 'poster_300x400' }] })
  })
  const [catalog] = await api.categories()
  const result = await api.search({ category: catalog.id, query: 'Lienzos' })
  assert.deepEqual(result.items.map(row => row.externalId), ['canvas_300x400'])
})

test('Gelato catalog search returns a specific error for an unknown catalog', async () => {
  const api = gelatoAdapter('fixture-key', async () => new Response(null, { status: 404 }))
  await assert.rejects(api.search({ category: 'Arte mural' }), { code: 'gelato_catalog_not_found' })
})

test('Gelato catalog list normalizes known envelopes and identifies malformed responses', async () => {
  const catalogs = [{ catalogUid: 'posters', title: 'Posters' }]
  for (const payload of [catalogs, { catalogs }, { data: catalogs }, { data: { catalogs } }]) {
    const api = gelatoAdapter('fixture-key', async () => Response.json(payload))
    assert.deepEqual(await api.categories(), [{ id: 'posters', title: 'Posters' }])
  }
  const invalidList = gelatoAdapter('fixture-key', async () => Response.json({ message: 'unexpected' }))
  await assert.rejects(invalidList.categories(), { code: 'gelato_catalog_invalid_list' })
  const invalidId = gelatoAdapter('fixture-key', async () => Response.json([{ title: 'Posters' }]))
  await assert.rejects(invalidId.categories(), { code: 'gelato_catalog_invalid_id' })
  const invalidJson = gelatoAdapter('fixture-key', async () => new Response('<html>'))
  await assert.rejects(invalidJson.categories(), { code: 'gelato_catalog_invalid_json' })
})
