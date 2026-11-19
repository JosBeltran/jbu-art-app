import { randomUUID } from 'node:crypto'

const GELATO_CATALOG = 'https://product.gelatoapis.com/v3'
const GELATO_ORDERS = 'https://order.gelatoapis.com/v4'
const PRODIGI = 'https://api.prodigi.com/v5'
const MAX_PAGE = 25

export class ProviderError extends Error {
  constructor(code, retryAfter = null) {
    super(code)
    this.code = code
    this.retryAfter = retryAfter
  }
}

function expect(value, validate) {
  if (!validate(value)) throw new ProviderError('invalid_provider_response')
  return value
}
const id = value => expect(value, s => typeof s === 'string' && s.length > 0 && s.length <= 300)
const list = value => expect(value, Array.isArray)
const text = (value, limit = 240) => typeof value === 'string' ? value.slice(0, limit) : null

function request(key, fetcher) {
  if (!key) throw new ProviderError('provider_not_configured')
  return async (url, body, headers = {}) => {
    let response
    try {
      response = await fetcher(url, { method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        headers: { ...headers, 'X-API-Key': key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) })
    } catch {
      throw new ProviderError('provider_unreachable')
    }
    if (!response.ok) throw new ProviderError(
      response.status === 429 ? 'provider_rate_limited' : response.status === 404 ? 'provider_not_found' : 'provider_rejected',
      response.headers.get('retry-after'))
    const raw = await response.text()
    if (raw.length > 2_000_000) throw new ProviderError('invalid_provider_response')
    try { return JSON.parse(raw) } catch { throw new ProviderError('invalid_provider_response') }
  }
}

function money(amount, currency) {
  expect(currency, value => typeof value === 'string' && /^[A-Z]{3}$/.test(value))
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
  const decimal = typeof amount === 'string' || typeof amount === 'number' ? String(amount) : ''
  const parts = /^(\d+)(?:\.(\d+))?$/.exec(decimal)
  if (!parts || (parts[2]?.length || 0) > digits) throw new ProviderError('invalid_provider_money')
  const minor = Number(parts[1] + (parts[2] || '').padEnd(digits, '0'))
  return expect(minor, n => Number.isSafeInteger(n) && n <= 999999999999)
}

function freshQuote(country, currency, costs, options = []) {
  const now = Date.now()
  return { ...costs, country, currency, options, quotedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60_000).toISOString() }
}

function parameters({ limit = MAX_PAGE, offset = 0 } = {}) {
  return { limit: Math.min(MAX_PAGE, Math.max(1, limit)), offset }
}

function prodigiProduct(row) {
  return { externalId: id(row.id), title: text(row.name) || row.id, category: text(row.category),
    description: text(row.description, 2000), shippingRegions: row.shipsTo || [], attributes: row.attributes || {} }
}

function prodigiVariant(row) {
  const areas = Array.isArray(row.printAreas) ? row.printAreas : []
  return { externalVariantId: id(row.id), sku: id(row.sku), title: text(row.name) || row.sku,
    attributes: row.attributes || {}, size: row.sizeLabel?.metric || null,
    widthMm: row.dimensions?.width?.mm || null, heightMm: row.dimensions?.height?.mm || null,
    options: row.attributeOptions || {}, combinations: row.combinations || [],
    printAreas: areas.map(area => ({ name: text(area.name), widthMm: area.widthMm, heightMm: area.heightMm,
      recommendedDpi: area.recommendedDpi, required: area.required === true })) }
}

export function prodigiAdapter(apiKey, fetcher = fetch) {
  const call = request(apiKey, fetcher)
  return {
    async categories(input) {
      const response = await call(PRODIGI + '/catalogue/categories?' + new URLSearchParams(parameters(input)))
      return list(response.data).map(row => ({ id: id(row.id), title: text(row.name) || row.id }))
    },
    async search({ query, category, ...page }) {
      const path = query ? '/catalogue/search' : '/catalogue/products'
      const params = parameters(page)
      if (query) params.q = query
      if (!query && category) params.category = category
      const response = await call(PRODIGI + path + '?' + new URLSearchParams(params))
      return { items: list(response.data).map(prodigiProduct), total: response.total ?? null }
    },
    async product(externalId, page) {
      const url = PRODIGI + '/catalogue/products/' + encodeURIComponent(externalId)
      const [product, variants] = await Promise.all([
        call(url), call(url + '/variants?' + new URLSearchParams(parameters(page))),
      ])
      return { ...prodigiProduct(product.data), variants: list(variants.data).map(prodigiVariant), total: variants.total ?? null }
    },
    async quote({ variantId, destination, currency, quantity, attributes }) {
      const { data } = await call(PRODIGI + '/quotes/order', {
        items: [{ catalogueVariantId: variantId, quantity, ...(attributes ? { attributes } : {}) }],
        shippingAddress: { countryCode: destination.country, line1: destination.line1, townOrCity: destination.city,
          postalOrZipCode: destination.postalCode, ...(destination.region ? { stateOrCounty: destination.region } : {}) },
        ...(['AUD','EUR','GBP','USD'].includes(currency) ? { currencyCode: currency } : {}),
      })
      expect(data, value => value && value.items?.currency && value.shipping?.currency)
      const actual = data.items.currency
      expect(data, value => value.shipping.currency === actual && (!value.tax || value.tax.currency === actual))
      return freshQuote(destination.country, actual, { manufacturingMinor: money(data.items.amount, actual),
        shippingMinor: money(data.shipping.amount, actual), taxMinor: data.tax ? money(data.tax.amount, actual) : null },
      (Array.isArray(data.shippingOptions) ? data.shippingOptions : []).slice(0, MAX_PAGE).map(option => ({
        method: text(option.method), carrier: text(option.carrier),
        shippingMinor: option.cost?.currency === actual ? money(option.cost.amount, actual) : null,
        manufacturingMinor: option.items?.currency === actual ? money(option.items.amount, actual) : null,
        taxMinor: option.tax?.currency === actual ? money(option.tax.amount, actual) : null,
      })))
    },
    async submitOrder({ reference, variantId, quantity, address, recipient, configuration, fileUrl, shippingMethod, printArea }) {
      const { data } = await call(PRODIGI + '/orders', {
        merchantReference: reference, shippingMethod, submit: true,
        recipient: { name: recipient.name, email: recipient.email, phoneNumber: recipient.phone,
          address: { line1: address.line1, line2: address.line2, townOrCity: address.city,
            postalOrZipCode: address.postal_code, countryCode: address.country, stateOrCounty: address.state } },
        items: [{ sku: variantId, quantity, attributes: configuration, assets: [{ printArea, url: fileUrl }] }],
      }, { 'Idempotency-Key': reference })
      return { id: id(data.id), status: text(data.status) }
    },
    async orderStatus(orderId) {
      const { data } = await call(PRODIGI + '/orders/' + encodeURIComponent(orderId))
      return { id: id(data.id), status: text(data.status) }
    },
  }
}

function gelatoProduct(row, category = null) {
  const uid = id(row.productUid)
  return { externalId: uid, title: text(row.title) || uid, category,
    variants: [{ externalVariantId: uid, sku: uid, title: text(row.title) || uid,
      attributes: row.attributes || {}, widthMm: row.dimensions?.Width?.measureUnit === 'mm' ? row.dimensions.Width.value : null,
      heightMm: row.dimensions?.Height?.measureUnit === 'mm' ? row.dimensions.Height.value : null }],
    supportedCountries: row.supportedCountries || [] }
}

const gelatoSearchTerms = new Map([['lienzo', 'canvas'], ['lienzos', 'canvas']])

export function gelatoAdapter(apiKey, fetcher = fetch) {
  const call = request(apiKey, fetcher)
  return {
    async categories() {
      return list(await call(GELATO_CATALOG + '/catalogs')).map(row => ({ id: id(row.catalogUid), title: text(row.title) || row.catalogUid }))
    },
    async search({ category, query = '', ...page }) {
      if (!category) throw new ProviderError('gelato_catalog_required')
      const response = await call(GELATO_CATALOG + '/catalogs/' + encodeURIComponent(category) + '/products:search', parameters(page))
        .catch(error => {
          if (error.code === 'provider_not_found') throw new ProviderError('gelato_catalog_not_found')
          throw error
        })
      const products = list(response.products)
      const needle = query.trim().toLowerCase()
      const translated = gelatoSearchTerms.get(needle) || needle
      return { items: products.map(row => gelatoProduct(row, category)).filter(row =>
        !needle || [row.title, row.externalId, JSON.stringify(row.variants[0].attributes)]
          .some(value => value.toLowerCase().includes(needle) || value.toLowerCase().includes(translated))),
        nextOffset: products.length === parameters(page).limit ? (page.offset || 0) + products.length : null }
    },
    async product(externalId) {
      return gelatoProduct(await call(GELATO_CATALOG + '/products/' + encodeURIComponent(externalId)))
    },
    async quote({ variantId, destination, currency, quantity }) {
      const reference = randomUUID()
      const result = await call(GELATO_ORDERS + '/orders:quote', {
        orderReferenceId: reference, customerReferenceId: 'jbu-discovery', currency, allowMultipleQuotes: false,
        recipient: { country: destination.country, addressLine1: destination.line1, city: destination.city,
          postCode: destination.postalCode, ...(destination.region ? { state: destination.region } : {}) },
        products: [{ itemReferenceId: reference, productUid: variantId, quantity }],
      })
      const quotes = list(result.quotes)
      if (quotes.length !== 1) throw new ProviderError('quote_requires_manual_review')
      const products = list(quotes[0].products)
      const row = expect(products.find(item => item.itemReferenceId === reference && item.productUid === variantId && item.quantity === quantity), Boolean)
      const actual = row.currency
      const options = list(quotes[0].shipmentMethods).filter(option => option.currency === actual)
        .map(option => ({ method: text(option.shipmentMethodUid), carrier: text(option.name),
          shippingMinor: money(option.price, actual), minimumDays: option.minDeliveryDays, maximumDays: option.maxDeliveryDays }))
        .sort((a, b) => a.shippingMinor - b.shippingMinor || String(a.method).localeCompare(String(b.method)))
      if (!options.length) throw new ProviderError('shipping_quote_missing')
      return freshQuote(destination.country, actual, { manufacturingMinor: money(row.price, actual),
        shippingMinor: options[0].shippingMinor, taxMinor: null }, options.slice(0, MAX_PAGE))
    },
    async submitOrder({ reference, variantId, quantity, address, recipient, fileUrl, shippingMethod, printArea, currency }) {
      const [firstName, ...last] = recipient.name.trim().split(/\s+/)
      const row = await call(GELATO_ORDERS + '/orders', {
        orderType: 'order', orderReferenceId: reference, customerReferenceId: reference, currency,
        shipmentMethodUid: shippingMethod,
        shippingAddress: { firstName, lastName: last.join(' ') || firstName, email: recipient.email, phone: recipient.phone,
          addressLine1: address.line1, addressLine2: address.line2, city: address.city,
          postCode: address.postal_code, country: address.country, state: address.state },
        items: [{ itemReferenceId: reference, productUid: variantId, quantity, files: [{ type: printArea, url: fileUrl }] }],
      })
      return { id: id(row.id), status: text(row.fulfillmentStatus) }
    },
    async orderStatus(orderId) {
      const row = await call(GELATO_ORDERS + '/orders/' + encodeURIComponent(orderId))
      return { id: id(row.id), status: text(row.fulfillmentStatus) }
    },
  }
}

export function providerAdapter(provider) {
  if (provider === 'gelato') return gelatoAdapter(process.env.GELATO_API_KEY)
  if (provider === 'prodigi') return prodigiAdapter(process.env.PRODIGI_API_KEY)
  throw new ProviderError('unknown_provider')
}
