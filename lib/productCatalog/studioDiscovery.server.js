import { describeStudioVariant } from './studioDiscovery.js'
const pageSize = 25

export function studioProductVariants(product, offset) {
  const configurations = product.variants.flatMap(variant => {
    const variants = Array.isArray(variant.combinations) && variant.combinations.length
      ? variant.combinations.map(row => row.attributes).filter(row=>row && typeof row === 'object' && !Array.isArray(row)) : Object.keys(variant.options || {}).length ? [] : [{}]
    return variants.map(configuration=>({
      ...variant,externalId:product.externalId, offset, configuration,
      countries:variant.countries || [],
      attributes:describeStudioVariant({ ...variant,attributes:{ ...variant.attributes,...configuration } }),
    }))
  })
  return { variants:configurations, nextOffset:(product.total == null ? product.variants.length === pageSize : product.total > offset+product.variants.length)
    ? offset+product.variants.length : null }
}
