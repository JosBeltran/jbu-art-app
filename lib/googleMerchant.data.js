/**
 * Datos del feed de Google Merchant — lectura pública, servidor.
 *
 * Reutiliza getArtworks() (la misma regla del catálogo: status público +
 * Serie activa) y enriquece con los campos bilingües y de precio desde la
 * tabla artworks, igual que hace el catálogo. No crea ningún catálogo
 * paralelo ni expone datos privados: solo información pública de la obra.
 */

import { supabase } from './supabaseClient.js'
import { getArtworks } from './artworks.js'
import { buildFeedItem, feedExclusionReason } from './googleMerchant.js'

export const FEED_ARTWORK_FIELDS =
  'id, sku, code, status, availability_status, ownership_status, price_display_mode, ' +
  'base_price_mxn, calculated_price_mxn, title, title_en, description, description_en, ' +
  'medium, medium_en, technique, technique_en, dimensions, year, series, series_id, ' +
  'primary_image_url, secondary_images, updated_at'

const groupBy = (rows, key) => {
  const map = new Map()
  for (const row of rows || []) {
    const k = String(row[key])
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(row)
  }
  return map
}

/**
 * Devuelve { items, excluded } para el feed público.
 * items: obras elegibles ya mapeadas; excluded: obras públicas descartadas
 * con su motivo (diagnóstico). Ante cualquier fallo de lectura devuelve un
 * feed vacío en lugar de publicar datos no verificados.
 */
export async function getMerchantFeedData() {
  const publicWorks = await getArtworks()
  if (!publicWorks.length) return { items: [], excluded: [] }

  const ids = publicWorks.map((a) => a.id)
  const [{ data: fullRows, error: fullError }, { data: seriesRows, error: seriesError }, { data: imageRows }] =
    await Promise.all([
      supabase.from('artworks').select(FEED_ARTWORK_FIELDS).in('id', ids),
      supabase.from('series').select('id, title, editorial_status, auto_launch, launch_date'),
      supabase
        .from('artwork_images')
        .select('artwork_id, image_url, media_type, display_order')
        .in('artwork_id', ids),
    ])

  // Sin la lectura completa o sin Series verificadas no se puede garantizar
  // la elegibilidad: feed vacío antes que un precio o estado incorrecto.
  if (fullError || !fullRows || seriesError || !seriesRows) {
    console.error('Merchant feed lookup failed:', fullError?.code || seriesError?.code)
    return { items: [], excluded: [] }
  }

  const byId = new Map(fullRows.map((r) => [String(r.id), r]))
  const imagesByArtwork = groupBy(imageRows, 'artwork_id')
  const items = []
  const excluded = []

  for (const publicWork of publicWorks) {
    const artwork = { ...publicWork, ...(byId.get(String(publicWork.id)) || {}) }
    const reason = feedExclusionReason(artwork, seriesRows)
    if (reason) {
      excluded.push({ sku: artwork.sku || null, title: artwork.title || null, reason })
      continue
    }
    items.push(buildFeedItem(artwork, seriesRows, imagesByArtwork.get(String(artwork.id)) || []))
  }

  return { items, excluded }
}
