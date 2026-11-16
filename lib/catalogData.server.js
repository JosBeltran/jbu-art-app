import 'server-only'
import { requestMarketCountry } from '@/lib/market.server'
import { loadShippingSettings, withShippingCountries } from '@/lib/shippingSettings.server'
import { itemAvailableInCountry, countryOptionsForItems } from '@/lib/countryAvailability'
import { getArtworks } from '@/lib/artworks'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { purchasablePrintArtworkIds } from '@/lib/catalogPrintAvailability'
import { getPrintMediaMap } from '@/lib/printMedia.server'

/** Shared public catalog data for /catalog and /series/[slug]. */
export async function getCatalogData({ country: requestedCountry = null, printsOnly = false } = {}) {
  const country = await requestMarketCountry(requestedCountry)
  const config = await loadShippingSettings(serviceClient()).catch(()=>({ globalCountries:[] }))
  const allArtworks = ((await getArtworks({ requireShippingCountries: true })) || []).map(a=>withShippingCountries(a,config))
  const artworks = allArtworks
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
  let countryOptions = countryOptionsForItems(allArtworks,config.globalCountries)
  let printImageMap = {}
  if (artworks.length) {
    try {
      const db = serviceClient()
      const ids = artworks.map((artwork) => artwork.id)
      const eligibleVariants = []
      for (let i = 0; i < ids.length; i += 200) {
        const group = ids.slice(i, i + 200)
        for (let offset = 0; ; offset += 200) {
          const { data, error } = await db.from('artwork_prints')
            .select('*').in('artwork_id', group).eq('is_active', true)
            .or('is_available.is.null,is_available.eq.true').gt('price', 0)
            .order('id').range(offset, offset + 199)
          if (error) throw error
          eligibleVariants.push(...(data || []))
          if (!data || data.length < 200) break
        }
      }
      countryOptions = countryOptionsForItems([...allArtworks, ...eligibleVariants],config.globalCountries)
      const parents=new Map(artworks.map(a=>[a.id,a]))
      const countryVariants = eligibleVariants.map(v=>withShippingCountries(v,config,parents.get(v.artwork_id))).filter(v => itemAvailableInCountry(v,country))
      printArtworkIds = [...purchasablePrintArtworkIds(artworks, countryVariants, country)]
      const printIds = new Set(printArtworkIds)
      const resolved = await getPrintMediaMap(db, artworks, countryVariants.filter(v => printIds.has(String(v.artwork_id))))
      // Only public URL choices go to client components; never expose raw variant rows.
      printImageMap = Object.fromEntries(artworks.map(a => [a.id, {
        general: resolved[a.id]?.general || a.primary_image_url || null,
        prints: resolved[a.id]?.prints || a.primary_image_url || null,
        title: resolved[a.id]?.variants[0]?.title || null,
        title_en: resolved[a.id]?.variants[0]?.title_en || null,
        startingPriceMxn: resolved[a.id]?.variants?.length
          ? Math.min(...resolved[a.id].variants.map(v => Number(v.price)).filter(v => Number.isFinite(v) && v > 0))
          : null,
      }]))
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

  // Filter before result counts and client rendering. In print mode only variant
  // restrictions matter; the physical original's restriction is independent.
  const printIds = new Set(printArtworkIds.map(String))
  const visibleArtworks = artworks.filter(a => printsOnly
    ? printIds.has(String(a.id))
    : itemAvailableInCountry(a, country))
  return { artworks: visibleArtworks, seriesNames, printArtworkIds, printImageMap, countryOptions, siteSettings }
}
