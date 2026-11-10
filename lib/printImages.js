import { getAvailability } from './artworkStatus.js'
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
export function resolvePrintImage({ artwork, gallery = [], variants = [], context = 'general' }) {
  const original = artwork?.primary_image_url || artwork?.image_url || artwork?.image || null
  const eligible = sortPrintVariants(variants.filter(purchasableVariant))
  if (!eligible.length) return original
  if (context === 'general' && getAvailability(artwork) === 'AVAILABLE') return original
  const flagged = firstFlaggedPrintImage(gallery)
  const assigned = eligible.find(v => v.resolved_print_image_url)?.resolved_print_image_url
  return (context === 'prints' ? assigned || flagged : flagged || assigned) || original
}

/** Stripe needs an absolute public URL even when an existing image is a site asset. */
export function publicPrintImageUrl(image, siteUrl) {
  if (/^https?:\/\//i.test(image || '')) return image
  if (image?.startsWith('/') && !image.startsWith('//')) return new URL(image, siteUrl).href
  return null
}
