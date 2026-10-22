import { supabase } from './supabaseClient'
import { isHomeEligible } from './homeSeries.js'

/** Public discovery shares the same effective Series state as Home. */
export async function getArtworks({ ids, series, excludeId, limit } = {}) {
  const query = (from) => {
    let q = supabase.from(from).select('*').in('status', ['AVAILABLE', 'OWNED'])
    if (ids) q = q.in('id', ids)
    if (series) q = q.eq('series', series)
    if (excludeId) q = q.neq('id', excludeId)
    return q.order('created_at', { ascending: false })
  }
  let { data, error } = await query('artworks_discoverable')
  if (error) ({ data, error } = await query('artworks'))
  if (error) {
    console.error('Public artwork lookup failed:', error.code)
    return []
  }
  if (!data?.length) return []
  const { data: seriesRows, error: seriesError } = await supabase.from('series')
    .select('id, title, editorial_status, auto_launch, launch_date')
  // Never expose works when the parent state cannot be verified.
  if (seriesError || !seriesRows) {
    console.error('Public Series lookup failed:', seriesError?.code)
    return []
  }
  const visible = data.filter((artwork) => isHomeEligible(artwork, seriesRows))
  return typeof limit === 'number' ? visible.slice(0, limit) : visible
}

export async function getArtworkBySku(sku) {
  const { data, error } = await supabase
    .from('artworks')
    .select(`
      *,
      artwork_metrics (*),
      artwork_prints (*)
    `)
    .eq('sku', sku)
    .single()

  if (error) {
    console.error(`❌ Error obteniendo la obra ${sku}:`, error.message)
    return null
  }

  // Procedencia pública (vista sin datos privados). Si la vista aún no existe, queda vacía.
  if (data) {
    try {
      const { data: prov } = await supabase
        .from('artwork_provenance_public')
        .select('*')
        .eq('artwork_id', data.id)
        .order('created_at', { ascending: true })
      data.provenance_events = prov || []
    } catch { data.provenance_events = [] }
  }

  // Filtrar o preservar solo prints activos si la obra permite impresiones
  if (data && data.artwork_prints) {
    data.artwork_prints = data.artwork_prints.filter((print) => print.is_active)
  }

  return data
}

/**
 * Función auxiliar para obtener únicamente los prints activos de una obra por su ID
 */
export async function getArtworkPrints(artworkId) {
  const { data, error } = await supabase
    .from('artwork_prints')
    .select('*')
    .eq('artwork_id', artworkId)
    .eq('is_active', true)
    .order('price', { ascending: true })

  if (error) {
    console.error(`❌ Error obteniendo prints para obra ${artworkId}:`, error.message)
    return []
  }

  return data || []
}