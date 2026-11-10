import { getPrintMediaMap } from './printMedia.server.js'
import { variantImage } from './printImages.js'
import { isPrintId } from './printManager.js'

export function printCheckoutItem(line) {
  const product = line.price?.product
  const data = product?.metadata
  if (!isPrintId(data?.artwork_id)) throw new Error('invalid_print_checkout_product')
  if (!data.variant_id) return { id: data.artwork_id, type: 'ORIGINAL' }
  if (!isPrintId(data.variant_id) || !['OPEN', 'LIMITED'].includes(data.edition_type))
    throw new Error('invalid_print_checkout_product')
  return {
    id: data.artwork_id, type: 'PRINT', variant_id: data.variant_id, title: product.name,
    size: data.size || null, finish: data.finish || null, sku: data.sku || null,
    image_url: product.images?.[0] || null, edition_type: data.edition_type,
  }
}

/** Sessions created before product snapshots existed still have their selected variant ID. */
export async function resolveLegacyPrintSnapshots(db, requested, fulfillment) {
  const entries = fulfillment.flatMap((item, i) => {
    const id = requested[i]?.variant_id || requested[i]?.variantId
    return item.type === 'PRINT' && id ? [{ item, id }] : []
  })
  if (!entries.length) return
  const [{ data: variants, error: variantsError }, { data: artworks, error: artworkError }] = await Promise.all([
    db.from('artwork_prints').select('*').in('id', [...new Set(entries.map(entry => entry.id))]),
    db.from('artworks').select('id,primary_image_url').in('id', [...new Set(entries.map(entry => entry.item.id))]),
  ])
  if (variantsError || artworkError) throw new Error('print_media_lookup_failed')
  const media = await getPrintMediaMap(db, artworks, variants, { includeInactive: true })
  const artworksById = new Map(artworks.map(a => [a.id, a]))
  for (const { item, id } of entries) {
    const art = artworksById.get(item.id)
    const variant = media[item.id]?.variants.find(row => row.id === id)
    if (!variant) throw new Error('print_variant_mismatch')
    Object.assign(item, {
      variant_id: id, size: variant.size, finish: variant.finish, title: variant.title, sku: variant.sku,
      image_url: variantImage(variant, art?.primary_image_url, media[item.id]?.gallery),
    })
  }
}
