import 'server-only'
import { cache } from 'react'
import { getArtworkBySku } from './artworks'
import { getPrintMediaMap } from './printMedia.server'
import { getPublicPrintArtworks } from './publicPrintDiscovery.server'
import { supabase } from './supabaseClient'
import { serviceClient } from './offersAuth'
import { loadShippingSettings } from './shippingSettings.server'
import { cachePrintDetail } from './printDetailCache.server'
import { fineArtCurrencies, marketVariant } from './productCatalog/commerce'
import { loadPrintRoomScenes } from './productCatalog/roomScene.server'
import { loadFineArtVariants, fineArtPublic } from './productCatalog/commerce.server'

// A shared tag covers writes such as enabling a price book that affects many
// designs. Each artwork still has its own cache entry, independent of cookies.
export const getPrintArtwork = cache(cachePrintDetail('artwork', async sku => {
  const { data, error } = await supabase.from('artworks')
    .select('id,sku,title,title_en,primary_image_url,allows_prints,version_kind,version_published_at,is_historical_version,artwork_prints(id,is_active,price,edition_type)')
    .eq('sku',sku).eq('artwork_prints.is_active',true).maybeSingle()
  if (error) throw error
  return data
}))

export const getPrintShippingSettings = cache(cachePrintDetail('shipping', () => loadShippingSettings(serviceClient())))

class PartialPrintCatalog extends Error {
  constructor(variants,error) {
    super('Partial print catalog',{cause:error})
    this.variants=variants
  }
}

const readCommercial = cachePrintDetail('commercial', async artworkId => {
  const db=serviceClient()
  const shipping = await loadShippingSettings(db)
  let partialError
  const variants = await loadFineArtVariants(db,shipping,{
    artworkIds:[artworkId],listing:true,deferPriceValidity:true,onPartialError:error=>{partialError ||= error},
  })
  if (partialError) throw new PartialPrintCatalog(variants.map(fineArtPublic),partialError)
  return variants.map(fineArtPublic)
})

export const getPrintCommercial = cache(async artworkId => {
  let variants, partialError
  try {
    variants=await readCommercial(artworkId)
  } catch (error) {
    if (!(error instanceof PartialPrintCatalog)) throw error
    variants=error.variants
    partialError=error.cause
  }
  // A scheduled price can start or expire even when the cached rows are fresh.
  const active=variants.filter(variant=>variant.countries.some(country=>
    fineArtCurrencies.some(currency=>marketVariant(variant,country,currency))))
  if (partialError && !active.length) throw partialError
  if (partialError) console.error('[prints] Some print options could not load:',partialError.code || partialError.message)
  return {variants:active,partial:Boolean(partialError)}
})

const readScenes=cachePrintDetail('scenes',(artworkId,variants,primary)=>
  loadPrintRoomScenes(serviceClient(),artworkId,variants,primary))

export function getPrintScenes(artworkId,variants,primary) {
  return readScenes(artworkId,variants.map(row=>({
    id:row.id,productId:row.productId,productFamily:row.productFamily,previewGeometry:Boolean(row.previewGeometry),
    gallery:row.gallery.filter(image=>image.primary && image.illustration),
  })),primary)
}

export const getPrintVersions = cachePrintDetail('versions', async artworkId => {
  const {data,error}=await supabase.rpc('public_artwork_versions',{ _artwork:artworkId })
  if (error) throw error
  return data || []
})

export const getLegacyPrintArtwork = cachePrintDetail('legacy-artwork', async sku => {
  const artwork=await getArtworkBySku(sku,{throwOnError:true})
  if (!artwork) return null
  const { id,title,title_en,primary_image_url,image_url,image,secondary_images,allows_prints,artwork_prints,
    version_kind,version_published_at,is_historical_version,print_price_mxn,print_type,prints_sold,print_edition_size,
    allowed_shipping_countries,shipping_policy_ids }=artwork
  return {id,sku,title,title_en,primary_image_url,image_url,image,secondary_images,allows_prints,artwork_prints,
    version_kind,version_published_at,is_historical_version,print_price_mxn,print_type,prints_sold,print_edition_size,
    allowed_shipping_countries,shipping_policy_ids}
})

export const getLegacyPrintMedia = cachePrintDetail('legacy-media', async (id, variants) => {
  const map=await getPrintMediaMap(serviceClient(),[{id}],variants,{includeInactive:true})
  return map[id] || null
})

export const getLegacyPrintVisibility = cachePrintDetail('legacy-visibility', async artworkId =>
  (await getPublicPrintArtworks([artworkId])).length>0)
