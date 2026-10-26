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
  const visible = await withPriceDisplayMode(data.filter((artwork) => isHomeEligible(artwork, seriesRows)))
  return typeof limit === 'number' ? visible.slice(0, limit) : visible
}

/**
 * La vista artworks_discoverable congela sus columnas al crearse (a.*), así que
 * puede no traer price_display_mode aunque la tabla ya lo tenga. Sin este campo
 * el catálogo trataría una obra «Consultar precio» como SHOW_PRICE y mostraría
 * el precio. Se completa desde la tabla, la misma fuente que usa la ficha.
 * Si la lectura falla, se oculta el precio (fail-closed) en vez de exponerlo.
 */
async function withPriceDisplayMode(rows) {
  if (!rows.length || rows.every((row) => 'price_display_mode' in row)) return rows
  const { data, error } = await supabase.from('artworks')
    .select('id, price_display_mode').in('id', rows.map((row) => row.id))
  if (error) {
    // 42703: la columna aún no existe (migración 20261103 sin aplicar) → todo SHOW_PRICE, como hoy.
    if (error.code === '42703') return rows
    console.error('Price display lookup failed:', error.code)
    return rows.map((row) => ({ ...row, price_display_mode: 'CONTACT_FOR_PRICE' }))
  }
  const modes = new Map((data || []).map((row) => [row.id, row.price_display_mode]))
  return rows.map((row) => ({ ...row, price_display_mode: modes.get(row.id) ?? 'CONTACT_FOR_PRICE' }))
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