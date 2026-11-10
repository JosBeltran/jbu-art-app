import { purchasableVariant, variantImage } from './printImages.js'

/** Safe storefront fields for one card per variant. */
export function publicPrintOptions(artworks, resolved) {
  return artworks.flatMap(artwork => {
    const media = resolved[artwork.id]
    if (!artwork.sku || !media) return []
    return media.variants.filter(purchasableVariant).map(variant => ({
      id: variant.id,
      title: variant.title || artwork.title,
      titleEn: variant.title_en || variant.title || artwork.title_en || artwork.title,
      artworkTitle: artwork.title,
      artworkTitleEn: artwork.title_en || artwork.title,
      artworkSku: artwork.sku,
      size: variant.size,
      edition: String(variant.edition_type || 'OPEN').toUpperCase(),
      price: Number(variant.price),
      image: variantImage(variant, artwork.primary_image_url, media.gallery),
      href: '/artwork/' + encodeURIComponent(artwork.sku) + '?print=' + encodeURIComponent(variant.id) + '#prints',
    }))
  })
}
