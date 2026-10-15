import { supabase } from './supabaseClient'

export async function getArtworks() {
  const { data, error } = await supabase
    .from('artworks')
    .select(`*`)
    .in('status', ['AVAILABLE', 'OWNED'])
    .order('created_at', { ascending: false })

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