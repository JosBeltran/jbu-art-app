import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'

const tag = 'public-print-detail'

export function cachePrintDetail(key, read) {
  return unstable_cache(read, ['public-print-detail-v1', key], {
    tags: [tag],
    revalidate: 86_400,
  })
}

export function invalidatePrintDetail() {
  // Web requests after an admin save should block on fresh data.
  revalidateTag(tag, { expire: 0 })
}

const catalogWrites = new Set([
  'editProduct', 'addVariant', 'setVariantAttribute', 'setVariantCountries', 'linkArtwork',
  'linkProviderCandidate', 'transitionPublication', 'approvePrice', 'activateBook',
  'removeCommercialImage', 'selectCommercialPrimary', 'setLegacyReplacement', 'refreshPublicPrints',
])

export function invalidatePrintCatalogWrite(operation, result) {
  if (catalogWrites.has(operation) ||
      (operation === 'enableStudioMarket' && result.some(row => row.priceEntryId)) ||
      (operation === 'publishStudioVariants' && result.some(row => row.published))) {
    invalidatePrintDetail()
  }
}
