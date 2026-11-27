import 'server-only'
import { requestMarketCountry } from '@/lib/market.server'
import { loadShippingSettings, withShippingCountries } from '@/lib/shippingSettings.server'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { fineArtCurrencies, marketVariant } from '@/lib/productCatalog/commerce'
import { loadFineArtVariants } from '@/lib/productCatalog/commerce.server'

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
  if (!artworks.length) return artworks
  const config = await loadShippingSettings(serviceClient())
  for (let start=0;start<artworks.length;start+=batchSize) {
    const result=await supabase.from('artworks').select('id,series,allowed_shipping_countries,shipping_policy_ids').in('id',artworks.slice(start,start+batchSize).map(a=>a.id))
    if(result.error)throw result.error
    const parents=new Map((result.data||[]).map(a=>[a.id,a]))
    for(let i=start;i<Math.min(start+batchSize,artworks.length);i++) artworks[i]=withShippingCountries({...artworks[i],...parents.get(artworks[i].id)},config)
  }
  return artworks
}

export async function getPublicPrintCollection(requestedCountry = null) {
  const country = await requestMarketCountry(requestedCountry)
  try {
    const db=serviceClient()
    const config=await loadShippingSettings(db)
    let partialError
    const commercial=await loadFineArtVariants(db,config,{listing:true,onPartialError:error=>{partialError ||= error}})
    const offered = commercial.filter(row => !country || fineArtCurrencies.some(currency => marketVariant(row,country,currency)))
    if (partialError && !offered.length) throw partialError
    if (partialError) console.error('[prints] Some collection options could not load:',partialError.code || partialError.message)
    const independent = offered.map(({id,artworkSku,artworkTitle,artworkTitleEn,title,titleEn,size,series,countries,priceBooks,entries,gallery})=>({
      id,artworkSku,artworkTitle,artworkTitleEn,title,titleEn,size,series,countries,priceBooks,entries,
      edition:'OPEN',image:gallery[0].url,commercial:true,
    }))
    const countries=[...new Set(commercial.flatMap(row=>row.countries))].sort()
    return {options:independent,countries,partial:Boolean(partialError)}
  } catch (error) {
    console.error('[prints] Public print discovery failed:', error?.code || error?.message)
    return { options: [], countries: [], loadFailed:true }
  }
}
