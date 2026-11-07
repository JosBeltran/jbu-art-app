import 'server-only'
import { firstFlaggedPrintImage, resolvePrintImage, purchasableVariant } from './printImages.js'

/** Load only media needed for public print presentation through trusted server data.
 * Provenance refs are looked up via the public visibility-filtered view.
 */
export async function getPrintMediaMap(db, artworkRows = [], variantRows = []) {
  const ids = [...new Set(artworkRows.map(a => a.id).filter(Boolean))]
  const gallery = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('artwork_images')
      .select('id,artwork_id,image_url,display_order,media_type,is_print_image')
      .in('artwork_id', ids.slice(i, i + 200))
      .order('display_order', { ascending: true })
    if (error) throw error
    gallery.push(...(data || []))
  }
  const provenanceIds = [...new Set(variantRows.map(v => v.print_provenance_image_id).filter(Boolean))]
  const provenance = []
  for (let i = 0; i < provenanceIds.length; i += 200) {
    const { data, error } = await db.from('provenance_event_images_public')
      .select('id,artwork_id,image_url').in('id', provenanceIds.slice(i, i + 200))
    if (error) throw error
    provenance.push(...(data || []))
  }
  const mediaById = new Map(gallery.filter(i => i.media_type !== 'video').map(i => [i.id, i]))
  const historyById = new Map(provenance.map(i => [i.id, i]))
  const galleryByArtwork = new Map()
  for (const row of gallery) {
    if (!galleryByArtwork.has(row.artwork_id)) galleryByArtwork.set(row.artwork_id, [])
    galleryByArtwork.get(row.artwork_id).push(row)
  }
  const variantsByArtwork = new Map()
  for (const variant of variantRows.filter(purchasableVariant)) {
    const galleryImage = mediaById.get(variant.print_gallery_image_id)
    const historyImage = historyById.get(variant.print_provenance_image_id)
    const assigned = galleryImage?.artwork_id === variant.artwork_id ? galleryImage.image_url :
      historyImage?.artwork_id === variant.artwork_id ? historyImage.image_url : null
    const row = { ...variant, resolved_print_image_url: assigned }
    if (!variantsByArtwork.has(row.artwork_id)) variantsByArtwork.set(row.artwork_id, [])
    variantsByArtwork.get(row.artwork_id).push(row)
  }
  const artworkImages = {}
  for (const artwork of artworkRows) {
    const rows = galleryByArtwork.get(artwork.id) || []
    const variants = variantsByArtwork.get(artwork.id) || []
    artworkImages[artwork.id] = {
      general: resolvePrintImage({ artwork, gallery: rows, variants, context: 'general' }),
      prints: resolvePrintImage({ artwork, gallery: rows, variants, context: 'prints' }),
      firstFlagged: firstFlaggedPrintImage(rows),
      gallery: rows,
      variants,
    }
  }
  return artworkImages
}
