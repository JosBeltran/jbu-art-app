import 'server-only'
import { getArtworks } from '@/lib/artworks'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { purchasablePrintArtworkIds } from '@/lib/catalogPrintAvailability'
import { getPrintMediaMap } from '@/lib/printMedia.server'

/** Shared public catalog data for /catalog, /prints and /series/[slug]. */
export async function getCatalogData() {
  const artworks = (await getArtworks()) || []
  // Solo textos de nombre para mostrar el filtro en el idioma elegido; no cambia qué obras se ven.
  let seriesNames = []
  try {
    const { data } = await supabase.from('series').select('*')
    seriesNames = data || []
  } catch {
    seriesNames = []
  }

  // A single batched lookup of eligible print variants; never one query per card.
  // On failure, do not expose unverified print availability.
  let printArtworkIds = []
  let printImageMap = {}
  if (artworks.length) {
    try {
      const db = serviceClient()
      const ids = artworks.map((artwork) => artwork.id)
      const eligibleVariants = []
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await db.from('artwork_prints')
          .select('*')
          .in('artwork_id', ids.slice(i, i + 200))
          .eq('is_active', true)
          .or('is_available.is.null,is_available.eq.true')
          .gt('price', 0)
        if (error) throw error
        eligibleVariants.push(...(data || []))
      }
      printArtworkIds = [...purchasablePrintArtworkIds(artworks, eligibleVariants)]
      printImageMap = await getPrintMediaMap(db, artworks, eligibleVariants)
    } catch (error) {
      console.error('[catalog] Print discovery lookup failed:', error?.code || error?.message)
    }
  }

  // Canal de consulta de precio (migración 20261103); si falta, WhatsApp por defecto.
  let siteSettings = null
  try {
    const { data } = await supabase.from('site_settings').select('inquiry_channel, whatsapp_number').eq('id', true).maybeSingle()
    siteSettings = data || null
  } catch {
    siteSettings = null
  }

  return { artworks, seriesNames, printArtworkIds, printImageMap, siteSettings }
}
