import 'server-only'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { isPurchasablePrintVariant } from '@/lib/catalogPrintAvailability'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import { publicPrintOptions } from '@/lib/publicPrintCollection'

const batchSize = 200

// Use the anonymous client so the lookup honors public RLS even during checkout.
export async function getPublicPrintArtworks(ids) {
  const artworks = []
  for (let start = 0; start < ids.length; start += batchSize) {
    const { data, error } = await supabase.rpc('public_print_artworks', {
      _ids: ids.slice(start, start + batchSize),
    })
    if (error) throw error
    artworks.push(...(data || []))
  }
  return artworks
}

export async function getPublicPrintCollection() {
  try {
    const variants = []
    for (let start = 0; ; start += batchSize) {
      const { data, error } = await supabase.from('artwork_prints')
        .select('*').eq('is_active', true).or('is_available.is.null,is_available.eq.true').gt('price', 0)
        .order('id').range(start, start + batchSize - 1)
      if (error) throw error
      variants.push(...(data || []).filter(isPurchasablePrintVariant))
      if (!data || data.length < batchSize) break
    }
    const artworks = await getPublicPrintArtworks([...new Set(variants.map(v => v.artwork_id))])
    if (!artworks.length) return []
    const ids = new Set(artworks.map(a => a.id))
    const media = await getPrintMediaMap(serviceClient(), artworks, variants.filter(v => ids.has(v.artwork_id)))
    return publicPrintOptions(artworks, media)
  } catch (error) {
    console.error('[prints] Public print discovery failed:', error?.code || error?.message)
    return []
  }
}
