const validWindow = (row, at) => (!row.valid_from || Date.parse(row.valid_from) <= at) &&
  (!row.valid_to || Date.parse(row.valid_to) > at)
const available = (entry, book) => ({
  available: true, amountMinor: entry.amount_minor, currency: book.currency,
  bookId: book.id, entryId: entry.id, explanation: book.country ? 'country_book' : 'global_book',
})

/** Country, then segment specificity, then configured priority. Equal-ranked entries require correction. */
export function resolvePrice({ variant, books, entries, country, currency, channel = 'storefront', segment = null, at = Date.now() }) {
  if (variant.status !== 'active' || (variant.allowed_countries?.length && !variant.allowed_countries.includes(country))) {
    return { available: false, explanation: 'variant_unavailable' }
  }
  const eligible = new Map(books.filter(book => book.status === 'active' && book.currency === currency && book.channel === channel &&
    (!book.country || book.country === country) && (!book.segment || book.segment === segment) && validWindow(book, at))
    .map(book => [book.id, book]))
  const ranked = entries.flatMap(entry => {
    const book = eligible.get(entry.price_book_id)
    if (!book || entry.product_variant_id !== variant.id || entry.status !== 'active' || !validWindow(entry, at)) return []
    return [{ entry, book }]
  })
  const compare = (a, b) => Number(Boolean(b.country)) - Number(Boolean(a.country)) ||
    Number(Boolean(b.segment)) - Number(Boolean(a.segment)) || b.priority - a.priority
  ranked.sort((a, b) => compare(a.book, b.book))
  if (!ranked.length) return { available: false, explanation: 'no_price' }
  if (ranked[1] && compare(ranked[0].book, ranked[1].book) === 0) return { available: false, explanation: 'ambiguous_price' }
  return available(ranked[0].entry, ranked[0].book)
}

export function proposePrice({ quote, currency, policy, fx, now = Date.now() }) {
  if (!Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= now) throw new Error('quote_expired')
  const cost = [quote.manufacturingMinor, quote.shippingMinor, quote.taxMinor]
  if (!cost.every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('invalid_cost')
  if (quote.currency !== currency && (!fx?.source || fx.from !== quote.currency || fx.to !== currency ||
    !Number.isFinite(fx.minorRate) || fx.minorRate <= 0 || !(Date.parse(fx.asOf) <= now) || now - Date.parse(fx.asOf) > 86_400_000)) {
    throw new Error('fresh_exchange_rate_required')
  }
  const fulfillmentMinor = Math.ceil(cost.reduce((sum, value) => sum + value, 0) * (quote.currency === currency ? 1 : fx.minorRate))
  const value = policy.value
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_pricing_policy')
  let retailMinor
  switch (policy.type) {
    case 'markup': retailMinor = Math.ceil(fulfillmentMinor * (10000 + value) / 10000); break
    case 'target_margin':
    case 'minimum_margin':
      if (value >= 10000) throw new Error('invalid_pricing_policy')
      retailMinor = Math.max(policy.type === 'minimum_margin' ? (policy.baseMinor || 0) : 0,
        Math.ceil(fulfillmentMinor * 10000 / (10000 - value)))
      break
    case 'manual': retailMinor = value; break
    default: throw new Error('invalid_pricing_policy')
  }
  if (policy.roundingStepMinor != null && policy.type !== 'manual') {
    const step = policy.roundingStepMinor
    const ending = policy.roundingEndingMinor ?? 0
    if (!Number.isSafeInteger(step) || step < 1 || !Number.isSafeInteger(ending) || ending < 0 || ending >= step) {
      throw new Error('invalid_pricing_policy')
    }
    retailMinor = Math.ceil((retailMinor - ending) / step) * step + ending
  }
  if (!Number.isSafeInteger(retailMinor) || retailMinor < 1 || !Number.isSafeInteger(fulfillmentMinor)) throw new Error('invalid_pricing_policy')
  return { retailMinor, fulfillmentMinor, currency, grossMarginBps: Math.floor(10000 * (retailMinor - fulfillmentMinor) / retailMinor),
    quoteExpiresAt: quote.expiresAt, assumptions: { policy, fx: quote.currency === currency ? null : fx },
    warnings: retailMinor < fulfillmentMinor ? ['below_fulfillment_cost'] : [] }
}

export function analyzeCompatibility(asset, requirements) {
  const { widthMm, heightMm, minimumDpi, bleedMm, printableAreaVerified } = requirements
  if (![asset?.widthPx, asset?.heightPx, widthMm, heightMm, minimumDpi].every(n => Number.isFinite(n) && n > 0) ||
      !Number.isFinite(bleedMm) || bleedMm < 0 || !printableAreaVerified) return { status: 'requires_validation' }
  const width = widthMm + bleedMm * 2, height = heightMm + bleedMm * 2
  const dpi = 25.4 * Math.min(asset.widthPx / width, asset.heightPx / height)
  const crop = Math.abs((asset.widthPx / asset.heightPx) / (width / height) - 1)
  return { status: dpi < minimumDpi ? 'incompatible' : crop > 0.015 ? 'with_adjustment' : 'compatible',
    effectiveDpi: Math.floor(dpi), cropReviewRequired: crop > 0.015 }
}
