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
    const editionSize = Number(variant.edition_size || variant.print_limit || 0)
    const sold = Number(variant.prints_sold || 0)
    if (editionSize > 0 && sold >= editionSize) return false
  }
  return true
}

export function purchasablePrintArtworkIds(artworks, variants) {
  const ids = new Set(
    (artworks || []).filter(a =>
      a && (a.allows_prints ?? a.allow_prints ?? a.has_prints ?? false) !== false
    ).map(a => String(a.id))
  )
  return new Set((variants || [])
    .filter(isPurchasablePrintVariant)
    .map(v => String(v.artwork_id))
    .filter(id => ids.has(id)))
}
