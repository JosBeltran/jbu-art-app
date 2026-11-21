import { randomUUID } from 'node:crypto'
import { wallArtMoney } from './wallArt.js'

const GELATO_CATALOG = 'https://product.gelatoapis.com/v3'
const GELATO_ORDERS = 'https://order.gelatoapis.com/v4'
const PRODIGI = 'https://api.prodigi.com/v5'
const MAX_PAGE = 25

export class ProviderError extends Error {
  constructor(code, retryAfter = null, httpStatus = null) {
    super(code)
    this.code = code
    this.retryAfter = retryAfter
    this.httpStatus = httpStatus
  }
}

function expect(value, validate, field = null) {
  if (!validate(value)) {
    const error=new ProviderError('invalid_provider_response')
    if(field)error.responseField=field
    throw error
  }
  return value
}
const id = (value, field) => expect(value, s => typeof s === 'string' && s.length > 0 && s.length <= 300, field)
const list = (value, field) => expect(value, Array.isArray, field)
const text = (value, limit = 240) => typeof value === 'string' ? value.slice(0, limit) : null

// Catalog-only diagnostics: never retain error messages, URLs, headers or credentials.
function catalogNetworkFailure(error,phase,signal) {
  const codes={ENOTFOUND:'dns',EAI_AGAIN:'dns',ECONNRESET:'connection_reset',ECONNREFUSED:'connection_refused',
    ETIMEDOUT:'timeout',UND_ERR_CONNECT_TIMEOUT:'timeout',UND_ERR_HEADERS_TIMEOUT:'timeout',UND_ERR_BODY_TIMEOUT:'timeout',
    CERT_HAS_EXPIRED:'tls',DEPTH_ZERO_SELF_SIGNED_CERT:'tls',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'tls'}
  const code=error?.cause?.code || error?.code
  const failure=new ProviderError('provider_unreachable')
  failure.failureKind=(signal.aborted || error?.name==='TimeoutError') ? 'timeout' : Object.hasOwn(codes,code) ? codes[code] : 'network'
  failure.failurePhase=phase
  if(Object.hasOwn(codes,code))failure.networkCode=code
  return failure
}

function request(key, fetcher) {
  if (!key) throw new ProviderError('provider_not_configured')
  return async (url, body, headers = {}) => {
    let response
    const catalogRead=url.startsWith(GELATO_CATALOG+'/') || url.startsWith(PRODIGI+'/catalogue/')
    const signal=AbortSignal.timeout(10000)
    try {
      response = await fetcher(url, { method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
        signal,
        headers: { ...headers, 'X-API-Key': key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) })
    } catch(error) {
      if(catalogRead)throw catalogNetworkFailure(error,'headers',signal)
      throw new ProviderError('provider_unreachable')
    }
    if (!response.ok) throw new ProviderError(
      response.status === 429 ? 'provider_rate_limited' : response.status === 404 ? 'provider_not_found' : 'provider_rejected',
      response.headers.get('retry-after'),response.status)
    let raw
    try { raw=await response.text() } catch(error) {
      if(catalogRead)throw catalogNetworkFailure(error,'body',signal)
      throw error
    }
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

// URLs are references only: API presence does not establish a commercial usage licence.
function supplierImageReferences(row) {
  const images = Array.isArray(row.images) ? row.images : row.imageUrl ? [row.imageUrl] : []
  return images.slice(0,12).flatMap(image => {
    const url = typeof image === 'string' ? image : image?.url
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:' && parsed.href.length<=2048 && !parsed.username && !parsed.password
        ? [{url:parsed.href, source:'supplier_api', permission:'unverified', kind:'supplier_reference'}] : []
    } catch { return [] }
  })
}

function prodigiProduct(row) {
  return { externalId: id(row.id), title: text(row.name) || row.id, category: text(row.category),
    description: text(row.description, 2000), rawMetadata: row, imageReferences: supplierImageReferences(row), shippingRegions: row.shipsTo || [], attributes: row.attributes || {} }
}

function prodigiVariant(row) {
  expect(row.combinations,value=>value==null || Array.isArray(value))
  const areas = Array.isArray(row.printAreas) ? row.printAreas : []
  return { externalVariantId: id(row.id), sku: id(row.sku), title: text(row.name) || row.sku,
    rawMetadata: row, attributes: row.attributes || {}, size: row.sizeLabel?.metric || null,
    widthMm: row.dimensions?.width?.mm || null, heightMm: row.dimensions?.height?.mm || null,
    options: row.attributeOptions || {}, combinations: row.combinations || [],
    countries:Array.isArray(row.shipsTo) && row.shipsTo.every(code=>typeof code==='string' && /^[A-Z]{2}$/.test(code)) ? row.shipsTo : [],
    printAreas: areas.map(area => ({ name: text(area.name), widthMm: area.widthMm, heightMm: area.heightMm,
      recommendedDpi: area.recommendedDpi, required: area.required === true })) }
}

export function prodigiAdapter(apiKey, fetcher = fetch) {
  const call = request(apiKey, fetcher)
  return {
    async definition(externalId) {
      const product=prodigiProduct((await call(PRODIGI+'/catalogue/products/'+encodeURIComponent(externalId))).data)
      return {id:product.externalId,title:product.title,category:product.category,description:product.description,
        attributes:Object.entries(product.attributes).filter(([,values])=>Array.isArray(values)).map(([id,values])=>({id,title:id,values:values.filter(value=>typeof value==='string').map(value=>({id:value,title:value}))}))}
    },
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
      return { items: list(response.data).map(prodigiProduct), total: response.total ?? null,
        pagination:{advanceBy:response.limit ?? params.limit,sourceIds:response.data.map(row=>row.id),sourceCount:response.data.length,offset:response.offset ?? params.offset,limit:response.limit ?? params.limit,explicitNext:Object.hasOwn(response,'nextOffset'),nextOffset:response.nextOffset,total:response.total ?? null},
        ...(Object.hasOwn(response,'nextOffset') ? {nextOffset:response.nextOffset} : {}) }
    },
    async product(externalId, page) {
      const url = PRODIGI + '/catalogue/products/' + encodeURIComponent(externalId)
      const [product, variants] = await Promise.all([
        call(url), call(url + '/variants?' + new URLSearchParams(parameters(page))),
      ])
      return { ...prodigiProduct(product.data), variants: list(variants.data).map(prodigiVariant), total: variants.total ?? null,
        pagination:{advanceBy:variants.limit ?? parameters(page).limit,sourceIds:variants.data.map(row=>row.id),sourceCount:variants.data.length,offset:variants.offset ?? page?.offset ?? 0,limit:variants.limit ?? parameters(page).limit,explicitNext:Object.hasOwn(variants,'nextOffset'),nextOffset:variants.nextOffset,total:variants.total ?? null},
        ...(Object.hasOwn(variants,'nextOffset') ? {nextOffset:variants.nextOffset} : {}) }
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

function millimetres(dimension) {
  const factor={mm:1,cm:10,in:25.4,inch:25.4,inches:25.4}[String(dimension?.measureUnit).toLowerCase()]
  const value=Number(dimension?.value)
  return factor && Number.isFinite(value) && value>0 ? value*factor : null
}

function gelatoProduct(row, category = null) {
  const uid = id(row.productUid)
  return { externalId: uid, title: text(row.title) || uid, category, description: text(row.description,2000), rawMetadata: row, imageReferences: supplierImageReferences(row),
    variants: [{ externalVariantId: uid, sku: uid, title: text(row.title) || uid,
      attributes: row.attributes || {}, widthMm: millimetres(row.dimensions?.Width),
      heightMm: millimetres(row.dimensions?.Height) }],
    supportedCountries: row.supportedCountries || [] }
}

const gelatoSearchTerms = new Map([['lienzo', 'canvas'], ['lienzos', 'canvas']])

export function gelatoAdapter(apiKey, fetcher = fetch) {
  const call = request(apiKey, fetcher)
  return {
    async definition(catalogId) {
      try {
        const data=await call(GELATO_CATALOG+'/catalogs/'+encodeURIComponent(catalogId))
        expect(data?.catalogUid,value=>value===catalogId,'catalogUid')
        const attributes=list(data.productAttributes,'productAttributes')
        // Some catalog attributes do not provide an enumerable values array.
        // Use catalog-wide native search facets, never infer choices from SKU strings
        // or a partial product page. One bounded request covers all such attributes.
        for(const attribute of attributes)id(attribute?.productAttributeUid,'productAttributes[].productAttributeUid')
        let attributeHits
        if(attributes.some(attribute=>!Array.isArray(attribute.values))) {
          const search=await call(GELATO_CATALOG+'/catalogs/'+encodeURIComponent(catalogId)+'/products:search',{limit:1,offset:0})
          list(search?.products,'products')
          attributeHits=search?.hits?.attributeHits
        }
        return {id:catalogId,title:text(data.title) || catalogId,attributes:attributes.map(attribute=>{
          let values=attribute.values
          if(!Array.isArray(values)) {
            const hits=attributeHits?.[attribute.productAttributeUid]
            expect(hits,value=>value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length>0 &&
              Object.values(value).every(count=>Number.isSafeInteger(count) && count>=0),'productAttributes[].values')
            values=Object.entries(hits).filter(([,count])=>count>0).map(([uid])=>({productAttributeValueUid:uid,title:uid}))
            expect(values,rows=>rows.length>0,'productAttributes[].values')
          }
          return {id:attribute.productAttributeUid,title:text(attribute.title) || attribute.productAttributeUid,
            values:values.map(value=>({id:id(value?.productAttributeValueUid,'productAttributes[].values[].productAttributeValueUid'),title:text(value?.title) || value.productAttributeValueUid}))}
        })}
      } catch(error) {
        if(error instanceof ProviderError)error.providerOperation='catalog_definition'
        throw error
      }
    },
    async categories() {
      const payload = await call(GELATO_CATALOG + '/catalogs').catch(error => {
        if (error.code === 'invalid_provider_response') throw new ProviderError('gelato_catalog_invalid_json')
        throw error
      })
      const rows = Array.isArray(payload) ? payload : payload?.catalogs ?? payload?.data?.catalogs ?? payload?.data
      if (!Array.isArray(rows)) throw new ProviderError('gelato_catalog_invalid_list')
      return rows.map(row => {
        const uid = row?.catalogUid
        if (typeof uid !== 'string' || !uid.trim() || uid.length > 160) {
          throw new ProviderError('gelato_catalog_invalid_id')
        }
        return { id: uid, title: text(row.title) || uid }
      })
    },
    async search({ category, query = '', attributeFilters, ...page }) {
      try {
        if (!category) throw new ProviderError('gelato_catalog_required')
        const response = await call(GELATO_CATALOG + '/catalogs/' + encodeURIComponent(category) + '/products:search', {...parameters(page),...(attributeFilters ? {attributeFilters} : {})})
          .catch(error => {
            if (error.code === 'provider_not_found') throw new ProviderError('gelato_catalog_not_found')
            throw error
          })
        const products = list(response?.products,'products')
        const needle = query.trim().toLowerCase()
        const translated = gelatoSearchTerms.get(needle) || needle
        const offset=page.offset || 0
        const total=response.total ?? response.totalProducts ?? response.totalCount
        const next=response.nextOffset
        if(next!=null && (!Number.isInteger(next) || next<=offset))expect(false,Boolean,'pagination')
        if(total!=null && (!Number.isInteger(total) || total<0 || (!products.length && total>offset && next==null)))expect(false,Boolean,'pagination')
        return { pagination:{sourceIds:products.map(row=>row?.productUid),sourceCount:products.length,offset,limit:parameters(page).limit,explicitNext:Object.hasOwn(response,'nextOffset'),nextOffset:next,total:total ?? null},total:total ?? null,attributeHits:response.hits?.attributeHits || null,items: products.map(row => {
          id(row?.productUid,'products[].productUid')
          return gelatoProduct(row, category)
        }).filter(row =>
          !needle || [row.title, row.externalId, JSON.stringify(row.variants[0].attributes)]
            .some(value => value.toLowerCase().includes(needle) || value.toLowerCase().includes(translated))),
          nextOffset: Object.hasOwn(response,'nextOffset') ? next : total!=null
            ? offset+products.length<total ? offset+products.length : null
            : products.length === parameters(page).limit ? offset+products.length : null }
      } catch(error) {
        if(error instanceof ProviderError)error.providerOperation='catalog_search'
        throw error
      }
    },
    async product(externalId) {
      return gelatoProduct(await call(GELATO_CATALOG + '/products/' + encodeURIComponent(externalId)))
    },
    async marketPrice({ variantId, country, currency }) {
      const params = new URLSearchParams({ country, currency })
      const rows = list(await call(GELATO_CATALOG + '/products/' + encodeURIComponent(variantId) + '/prices?' + params))
      const single = rows.filter(row => row?.productUid === variantId && row.country === country &&
        row.currency === currency && row.quantity === 1 && row.pageCount == null)
      if (single.length !== 1) return { manufacturingMinor: null, shippingMinor: null, taxMinor: null, currency, country }
      // Gelato can publish amounts with more precision than the currency supports.
      const price = single[0].price
      const minor = typeof price === 'number' && price >= 0 ? Math.ceil(price * 10 ** wallArtMoney(currency) - 1e-8) : NaN
      expect(minor, n => Number.isSafeInteger(n) && n >= 0 && n <= 999999999999)
      return { manufacturingMinor: minor, shippingMinor: null, taxMinor: null, currency, country }
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
