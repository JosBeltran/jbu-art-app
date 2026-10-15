import { supabase } from './supabaseClient'

/**
 * Regla única de descubrimiento público (Portada, Catálogo, destacadas):
 * estado propio de la obra + la Serie padre no puede estar en "Próximamente".
 * "Destacada" nunca anula a la Serie. Se resuelve en la base (vista artworks_discoverable).
 */
export async function getArtworks() {
  const query = (from) => supabase
    .from(from)
    .select(`*`)
    .in('status', ['AVAILABLE', 'OWNED'])
    .order('created_at', { ascending: false })

  let { data, error } = await query('artworks_discoverable')
  // Respaldo mientras no se aplique la migración: se consulta la tabla y se filtra igual abajo.
  if (error) ;({ data, error } = await query('artworks'))

  // Regla de respaldo siempre activa: oculta obras de Series en "Próximamente",
  // ya sea que estén ligadas por series_id o por el nombre de la serie.
  if (!error && data?.length) {
    const { data: hidden } = await supabase.from('series').select('id, title, editorial_status, auto_launch, launch_date').eq('editorial_status', 'coming_soon')
    const now = Date.now()
    const blocked = (hidden || []).filter((s) => !(s.auto_launch && s.launch_date && new Date(s.launch_date).getTime() <= now))
    if (blocked.length) {
      const ids = new Set(blocked.map((s) => String(s.id)))
      const titles = new Set(blocked.map((s) => String(s.title || '').trim().toUpperCase()).filter(Boolean))
      data = data.filter((a) => !(a.series_id && ids.has(String(a.series_id))) && !(a.series && titles.has(String(a.series).trim().toUpperCase())))
    }
  }

  if (error) {
    console.error('❌ Error de Supabase:', error.message)
    return []
  }

  return data || []
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