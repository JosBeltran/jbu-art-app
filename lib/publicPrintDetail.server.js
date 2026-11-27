import 'server-only'
import { cache } from 'react'
import { supabase } from './supabaseClient'
import { serviceClient } from './offersAuth'
import { loadShippingSettings } from './shippingSettings.server'
import { loadFineArtVariants, fineArtPublic } from './productCatalog/commerce.server'

// Metadata and the page share these reads during a request. The next request
// reads current prices and destinations, including any recent admin changes.
export const getPrintArtwork = cache(async sku => {
  const { data, error } = await supabase.from('artworks')
    .select('id,sku,title,title_en,primary_image_url,allows_prints,version_kind,version_published_at,is_historical_version,artwork_prints(id,is_active,price,edition_type)')
    .eq('sku',sku).eq('artwork_prints.is_active',true).maybeSingle()
  if (error) throw error
  return data
})

export const getPrintShippingSettings = cache(() => loadShippingSettings(serviceClient()))

export const getPrintCommercial = cache(async artworkId => {
  const shipping = await getPrintShippingSettings()
  let partialError
  const variants = await loadFineArtVariants(serviceClient(),shipping,{
    artworkIds:[artworkId],listing:true,onPartialError:error=>{partialError ||= error},
  })
  if (partialError && !variants.length) throw partialError
  if (partialError) console.error('[prints] Some print options could not load:',partialError.code || partialError.message)
  return {variants:variants.map(fineArtPublic),partial:Boolean(partialError)}
})
