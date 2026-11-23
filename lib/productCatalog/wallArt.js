export const wallArtFamilies = {
  fine_art_print: ['Fine Art', 'Fine Art'],
  poster: ['Pósteres', 'Posters'],
  canvas: ['Lienzos', 'Canvas'],
  framed_print: ['Pósteres enmarcados', 'Framed posters'],
  framed_canvas: ['Lienzos enmarcados', 'Framed canvas'],
  acrylic: ['Acrílico', 'Acrylic'],
  metal: ['Metal', 'Metal'],
  wood: ['Madera', 'Wood'],
  panel: ['Otros paneles', 'Other panels'],
}

export const wallArtProductFamily = group => group === 'poster' ? 'fine_art_print' : group === 'framed_canvas' ? 'canvas' : ['metal','wood','panel'].includes(group) ? 'merchandise' : group

export function isUnrelatedProduct(key) {
  return /\b(cards?|postcards?|brochures?|apparel|t shirts?|mugs?|calendars?|photo books?|phone cases?|accessories|fold)\b/
    .test(key.toLowerCase().replace(/[_-]/g,' '))
}

export function wallArtGroup(product) {
  const key = [product.externalId, product.title, product.category].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ')
  if (isUnrelatedProduct(key)) return null
  const canvas = /\b(canvas|canvases|lienzos?)\b/.test(key)
  const framed = /\b(framed|frame and|float frame|enmarcad\w*)\b/.test(key)
  if (canvas) return framed ? 'framed_canvas' : 'canvas'
  if (framed) return 'framed_print'
  if (/\b(acrylic|plexiglass)\b/.test(key)) return 'acrylic'
  if (/\b(metal|aluminum prints?|aluminium prints?|dibond)\b/.test(key)) return 'metal'
  if (/\b(wood prints?|wooden prints?|art\/wood)\b/.test(key)) return 'wood'
  if (/\b(foam board)\b/.test(key)) return 'panel'
  if (/\b(fine ?art|gicl[eé]e|museum|enhanced matte art)\b/.test(key)) return 'fine_art_print'
  if (/\b(posters?|prints? matte)\b/.test(key)) return 'poster'
  return null
}

export function wallArtMoney(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
}

export function proposedWallArtPrice(cost, margin) {
  if (!Number.isSafeInteger(cost) || cost < 1 || !Number.isFinite(margin) || margin < 0 || margin >= 100) return null
  return Math.ceil(cost * 100 / (100 - margin))
}

export const printBorderOptions = [0,5,10,15,20,30]
export const supportsPrintBorder = family => ['poster','fine_art_print','framed_print'].includes(family)

export function wallArtQuoteStatus(cost, market, now = Date.now()) {
  const fresh = trace => trace?.variantId===cost?.variantId && Boolean(trace?.variantId) &&
    Date.parse(trace.quotedAt)<=now && Date.parse(trace.expiresAt)>now
  const amount = value => Number.isSafeInteger(value) && value>=0
  const manufacturing = amount(cost?.manufacturingMinor) && fresh(cost.manufacturingTrace)
  const shipping = amount(cost?.shippingMinor) && fresh(cost.shippingTrace) && !cost.shippingError
  const currencyMatches = cost?.currency===market?.currency && cost?.shippingCurrency===market?.currency
  const scope = cost?.destinationScope
  const usable = manufacturing && shipping && currencyMatches && cost.country===market?.country &&
    (scope==='address' ? cost.shippingKind==='address' && cost.shippingTrace.operation==='quote' &&
      cost.manufacturingTrace.operation==='quote' && cost.manufacturingTrace.quotedAt===cost.shippingTrace.quotedAt
      : scope==='country' && ['flat','average'].includes(cost.shippingKind))
  return {manufacturing,shipping,currencyMatches,verifiedAddress:Boolean(usable && scope==='address' && amount(cost.taxMinor)),
    // The existing Studio pricing policy applies margin before taxes.
    costBeforeTaxMinor:usable ? cost.manufacturingMinor+cost.shippingMinor : null}
}

export function wallArtProfit(retailMinor, costMinor, separateShippingRevenueMinor = 0) {
  if (![retailMinor,costMinor,separateShippingRevenueMinor].every(Number.isSafeInteger) ||
    retailMinor<=0 || costMinor<0 || separateShippingRevenueMinor<0) return null
  const revenue = retailMinor+separateShippingRevenueMinor
  const profitMinor = revenue-costMinor
  return {profitMinor, margin:100*profitMinor/revenue}
}
