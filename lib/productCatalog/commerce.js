import { resolvePrice } from './pricing.js'

export const fineArtCurrencies = ['MXN', 'USD']
export const fineArtCartKey = 'jbu_fine_art_cart_v1'
export const fineArtLineType = 'CATALOG_PRINT'
export const isCommerceId = value => typeof value === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value)

export function marketVariant(variant, country, currency) {
  if (!country || !variant.countries.includes(country) || !fineArtCurrencies.includes(currency)) return null
  const price = resolvePrice({
    variant: { id: variant.id, status: 'active', allowed_countries: variant.countries },
    books: variant.priceBooks, entries: variant.entries, country, currency,
  })
  return price.available ? price : null
}

export function marketChoices(variants,country,currency,preview=false) {
  return variants.filter(row=>preview || marketVariant(row,country,currency))
}

// Browsing an alternate price book keeps the options visible. A cart line
// still requires the currently selected charge currency.
export function printMarketOptions(variants,country,chargeCurrency,preview=false) {
  const available=marketChoices(variants,country,chargeCurrency,preview)
  if (available.length || !country || preview) return {options:available,alternateCurrency:null}
  for (const currency of fineArtCurrencies) {
    if (currency===chargeCurrency) continue
    const alternate=marketChoices(variants,country,currency)
    if (alternate.length) return {options:alternate,alternateCurrency:currency}
  }
  return {options:[],alternateCurrency:null}
}

export function catalogMoney(amountMinor, currency, locale) {
  return new Intl.NumberFormat(locale, { style:'currency', currency }).format(amountMinor / 100)
}

export function validCatalogCartLine({ id, variantId, quantity }) {
  return isCommerceId(id) && isCommerceId(variantId) && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100
}

export function normalizeFineArtCart(rows) {
  if (!Array.isArray(rows)) return []
  const variants = new Map()
  for (const row of rows.slice(0,30)) {
    if (row?.type !== fineArtLineType || !validCatalogCartLine(row) || !fineArtCurrencies.includes(row.currency) ||
      typeof row.destination !== 'string' || !/^[A-Z]{2}$/.test(row.destination) ||
      !Number.isSafeInteger(row.amountMinor) || row.amountMinor < 1 || row.amountMinor > 99999999) continue
    variants.set(row.variantId,row)
  }
  return [...variants.values()]
}

export function verifiedFineArtLines(lines, productTotal) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw new Error('fine_art_amount_mismatch')
  const entries = lines.map(line => {
    const variant = line.price?.product?.metadata?.catalog_variant_id
    if (!isCommerceId(variant) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100 ||
      !Number.isSafeInteger(line.amount_total) || line.amount_total <= 0 || line.amount_total !== line.amount_subtotal)
      throw new Error('fine_art_amount_mismatch')
    return [variant,{ quantity:line.quantity,subtotal:line.amount_subtotal,currency:line.currency }]
  })
  if (new Set(entries.map(([variant])=>variant)).size !== entries.length ||
    lines.reduce((total,line)=>total+line.amount_total,0) !== productTotal)
    throw new Error('fine_art_amount_mismatch')
  return Object.fromEntries(entries)
}
