import 'server-only'
import { cache } from 'react'
import { createHash } from 'node:crypto'
import { supabase } from '@/lib/supabaseClient'
import { getPublicPrintArtworks } from '@/lib/publicPrintDiscovery.server'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import { isPrintId } from '@/lib/printManager'
import { firstFlaggedPrintImage } from '@/lib/printImages'
import { loadSocialSettings } from './data.server'
import { isShareablePrint, printSharePresentation } from './print'

export const loadSharedPrint = cache(async id => {
  if (!isPrintId(id)) return null
  const { data: variant, error } = await supabase.from('artwork_prints')
    .select('id,artwork_id,size,paper_type,framing,finish,edition_type,price,is_active,image_url,print_gallery_image_id,print_provenance_image_id')
    .eq('id', id).eq('is_active', true).maybeSingle()
  if (error) throw error
  if (!isShareablePrint(variant)) return null
  const [artwork] = await getPublicPrintArtworks([variant.artwork_id])
  if (!artwork?.sku) return null
  return { variant, artwork }
})

export const sharedPrintContext = cache(async (id, language) => {
  const print = await loadSharedPrint(id)
  if (!print) return null
  const { artwork, variant } = print
  const [media, settings] = await Promise.all([
    getPrintMediaMap(supabase, [artwork], [variant], { includeInactive: true }).catch(error => {
      console.error('[print-social] media lookup failed', error?.code)
      return {}
    }),
    loadSocialSettings(),
  ])
  const artworkMedia = media[artwork.id]
  const images = [...new Set([
    artworkMedia?.variants[0]?.resolved_print_image_url || variant.image_url,
    firstFlaggedPrintImage(artworkMedia?.gallery),
    artwork.primary_image_url,
  ].filter(Boolean))]
  const presentation = printSharePresentation(artwork, variant, language)
  const { theme, logoUrl } = settings.config
  const revision = createHash('sha256').update(JSON.stringify({
    renderer: 1, presentation, images, theme, logoUrl, settingsRevision: settings.revision,
  })).digest('hex').slice(0, 16)
  return { ...print, images, presentation, theme, logoUrl, revision }
})
