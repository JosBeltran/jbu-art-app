import { isPurchasablePrintVariant } from './catalogPrintAvailability.js'
import { fineArtCurrencies, marketVariant } from './productCatalog/commerce.js'

// Consume only the existing public_artwork_versions projection. Never traverse
// raw artworks or infer versions from products/collection membership here.
export function relatedPublicArtworkVersions(artwork) {
  const seen = new Set([artwork.id])
  return (artwork.version_family || []).filter(row => {
    if (!row.id || !row.sku || seen.has(row.id) || row.status === 'DRAFT' ||
      (row.version_kind === 'SUCCESSOR' && !row.version_published_at)) return false
    seen.add(row.id)
    return true
  })
}

export function legacyArtworkPrintCountries(artwork) {
  if (!artwork.allows_prints) return []
  const variants=artwork.artwork_prints || []
  const active=variants.filter(isPurchasablePrintVariant).flatMap(row=>row.effective_shipping_countries || [])
  const limited=['LIMITED','LIMITADA'].includes(String(artwork.print_type || '').toUpperCase())
  const legacy=!variants.length && !artwork.has_managed_prints && Number(artwork.print_price_mxn)>0 &&
    (!limited || Number(artwork.prints_sold || 0)<Number(artwork.print_edition_size || 0))
  return [...new Set([...active,...(legacy ? artwork.effective_shipping_countries || [] : [])])]
}

export function commercialArtworkPrintCountries(variants) {
  return [...new Set(variants.flatMap(row=>row.countries.filter(country=>
    fineArtCurrencies.some(currency=>marketVariant(row,country,currency)))))]
}
