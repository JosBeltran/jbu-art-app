import { itemAvailableInCountry } from './countryAvailability.js'
/**
 * Catalog-only projection of the same purchasable print variants used by
 * artwork detail and checkout. Does not create a separate print product.
 */
export function isPurchasablePrintVariant(variant) {
  if (!variant || variant.is_active !== true || variant.is_available === false) return false
  const type = String(variant.edition_type || 'OPEN').toUpperCase()
  if (type !== 'OPEN' && type !== 'LIMITED' && type !== 'LIMITADA') return false
  const price = Number(variant.price)
  if (!Number.isFinite(price) || price <= 0) return false
  if (type !== 'OPEN') {
    const editionSize = Number(variant.max_edition_size || variant.edition_size || variant.print_limit || 0)
    const sold = Number(variant.prints_sold || 0)
    if (!Number.isInteger(editionSize) || editionSize < 1 || sold >= editionSize) return false
  }
  return true
}

export function purchasablePrintArtworkIds(artworks, variants, country = null) {
  const ids = new Set(
    (artworks || []).filter(a =>
      a && (a.allows_prints ?? a.allow_prints ?? a.has_prints ?? false) !== false
    ).map(a => String(a.id))
  )
  return new Set((variants || [])
    .filter(v => isPurchasablePrintVariant(v) && itemAvailableInCountry(v, country))
    .map(v => String(v.artwork_id))
    .filter(id => ids.has(id)))
}

export function hasPrintQuantity(variant, quantity) {
  if (!isPurchasablePrintVariant(variant) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return false
  if (String(variant.edition_type).toUpperCase() === 'OPEN') return true
  return quantity <= Number(variant.max_edition_size || variant.edition_size || variant.print_limit) - Number(variant.prints_sold || 0)
}
