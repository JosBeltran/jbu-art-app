// Open Edition checkout uses the print variant record, never artwork prices
// or frontend-supplied amounts. Only OPEN variants qualify for guest checkout.
export const GUEST_CART_KEY = 'jbu_open_edition_cart_v1'

export function cartKey(item) {
  const type = String(item.type || item.item_type || 'ORIGINAL').toUpperCase()
  const artworkId = item.artwork_id || item.id
  const variantId = item.print_variant_id || item.variantId || item.variant_id || ''
  return [type, artworkId, type === 'PRINT' ? variantId : ''].join(':')
}

export function normalizeGuestCart(items) {
  const unique = new Map()
  for (const row of Array.isArray(items) ? items : []) {
    if (row?.type !== 'PRINT' || !row?.id || !row?.variantId) continue
    const qty = Number(row.quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) continue
    const key = cartKey(row)
    if (unique.has(key)) {
      unique.get(key).quantity = Math.min(100, unique.get(key).quantity + qty)
    } else {
      unique.set(key, { id: String(row.id), variantId: String(row.variantId), type: 'PRINT', quantity: qty })
    }
  }
  return [...unique.values()]
}

export function guestOnlyAllowed(items, authenticated) {
  return Boolean(authenticated) || (Array.isArray(items) && items.length > 0 && items.every(i => i.type === 'PRINT' && Boolean(i.variantId)))
}

export function selectPrintRows(variantRows, requested) {
  const variants = new Map(variantRows.map(v => [String(v.id), v]))
  return requested.map(item => {
    const id = String(item.variantId || item.variant_id || item.print_variant_id || '')
    const variant = variants.get(id)
    if (!variant || String(variant.artwork_id) !== String(item.id || item.artwork_id) || (!variant.is_active || variant.is_available === false)) throw new Error('invalid_print_variant')
    if (String(variant.edition_type).toUpperCase() !== 'OPEN') throw new Error('not_open_edition')
    const quantity = Number(item.quantity ?? 1)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new Error('invalid_print_quantity')
    const priceMxn = Number(variant.price)
    if (!Number.isFinite(priceMxn) || priceMxn <= 0) throw new Error('invalid_print_price')
    return { ...variant, quantity, priceMxn }
  })
}

export const collectorPrintCartKey = userId => 'jbu_limited_edition_cart_v1:' + userId

export function hydratePrintCart(items, variants, edition, translate) {
  const byVariant = new Map(variants.map(row => [row.id, row]))
  return items.flatMap(item => {
    const variant = byVariant.get(item.variantId)
    const artwork = variant?.artwork
    if (!artwork || variant.artwork_id !== item.id || variant.is_active !== true || variant.edition_type !== edition)
      return []
    const title = translate(variant.title || artwork.title, variant.title_en || variant.title || artwork.title)
    return [{
      ...item, allowed_shipping_countries: variant.allowed_shipping_countries ?? null, sku: artwork.sku, title: [title, variant.size, variant.finish].filter(Boolean).join(' · '),
      price: Number(variant.price), size: variant.size, finish: variant.finish, edition_type: variant.edition_type,
      image: variant.resolved_print_image_url || artwork.primary_image_url,
      primary_image_url: artwork.primary_image_url,
    }]
  })
}
