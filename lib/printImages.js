/** One image-resolution policy shared by catalog, artwork detail, and cart. */
export function firstFlaggedPrintImage(gallery = []) {
  return [...gallery].filter(row => row?.is_print_image === true &&
    (row.media_type || 'image') === 'image' && row.image_url)
    .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0))
    .map(row => row.image_url)[0] || null
}
export function purchasableVariant(variant) {
  return Boolean(variant && variant.is_active === true && variant.is_available !== false &&
    Number(variant.price) > 0 && ['OPEN', 'LIMITED'].includes(String(variant.edition_type || '').toUpperCase()))
}
/** URL already resolved from a trusted public gallery/provenance row by the server. */
export function variantImage(variant, fallback, gallery = []) {
  return variant?.resolved_print_image_url || firstFlaggedPrintImage(gallery) || fallback || null
}
export function resolvePrintImage({ artwork, gallery = [], variants = [], context = 'general' }) {
  const original = artwork?.primary_image_url || artwork?.image_url || artwork?.image || null
  const eligible = variants.filter(purchasableVariant)
  if (!eligible.length) return original
  if (context === 'general' && String(artwork?.availability_status || artwork?.status || '').toUpperCase() === 'AVAILABLE') return original
  return firstFlaggedPrintImage(gallery) ||
    eligible.map(v => v.resolved_print_image_url).find(Boolean) || original
}
