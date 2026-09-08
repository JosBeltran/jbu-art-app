import { supabase } from './supabaseClient'

export async function getArtworks() {
  const { data, error } = await supabase
    .from('artworks')
    .select(`*`)
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
      provenance_events (*)
    `)
    .eq('sku', sku)
    .single()

  if (error) {
    console.error(`❌ Error obteniendo la obra ${sku}:`, error.message)
    return null
  }

  return data
}