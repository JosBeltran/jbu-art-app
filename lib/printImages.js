import { originalArtworkImage } from './artworkMedia.js'
import { isPurchasablePrintVariant } from './catalogPrintAvailability.js'
/** One image-resolution policy shared by catalog, artwork detail, and cart. */
export function firstFlaggedPrintImage(gallery = []) {
  return [...gallery].filter(row => row?.is_print_image === true &&
    (row.media_type || 'image') === 'image' && row.image_url)
    .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0))
    .map(row => row.image_url)[0] || null
}
export const purchasableVariant = isPurchasablePrintVariant
export function sortPrintVariants(variants) {
  return [...variants].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
    Number(a.price) - Number(b.price) || String(a.id).localeCompare(String(b.id)))
}
/** URL already resolved from a trusted public gallery/provenance row by the server. */
export function variantImage(variant, fallback, gallery = []) {
  return variant?.resolved_print_image_url || firstFlaggedPrintImage(gallery) || fallback || null
}
export function productPrintImage(variant, fallback, gallery = []) {
  const previous = variantImage(variant, fallback, gallery)
  return variant?.gallery_images?.[0]?.url || previous
}

export function resolvePrintImage({ artwork, gallery = [], variants = [], context = 'general' }) {
  const original = originalArtworkImage(artwork, gallery)
  if (context === 'general') return original
  const eligible = sortPrintVariants(variants.filter(purchasableVariant))
  return eligible.length ? productPrintImage(eligible[0], original, gallery) : original
}

/** Stripe needs an absolute public URL even when an existing image is a site asset. */
export function publicPrintImageUrl(image, siteUrl) {
  if (/^https?:\/\//i.test(image || '')) return image
  if (image?.startsWith('/') && !image.startsWith('//')) return new URL(image, siteUrl).href
  return null
}
