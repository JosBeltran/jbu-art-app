import { artworkPrintHref } from './printRoutes.js'
import { canonicalPrintSize, PRINT_ASSET_SIZES } from './printAssetPresets.js'
import { purchasableVariant, productPrintImage } from './printImages.js'

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
      series: artwork.series || null,
      size: variant.size,
      paper: variant.paper_type || null,
      dimensionsMm: PRINT_ASSET_SIZES[canonicalPrintSize(variant.size)]?.mm || null,
      madeToOrder: Boolean(variant.image_url?.includes('/print-previews/')),
      edition: String(variant.edition_type || 'OPEN').toUpperCase() === 'OPEN' ? 'OPEN' : 'LIMITED',
      price: Number(variant.price),
      image: productPrintImage(variant, media.general, media.gallery),
      href: artworkPrintHref(artwork.sku, { variant: variant.id }),
    }))
  })
}
