import 'server-only'
import { requestMarketCountry } from '@/lib/market.server'
import { loadShippingSettings, withShippingCountries } from '@/lib/shippingSettings.server'
import { itemAvailableInCountry, countryOptionsForItems } from '@/lib/countryAvailability'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { isPurchasablePrintVariant } from '@/lib/catalogPrintAvailability'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import { fineArtCurrencies, marketVariant } from '@/lib/productCatalog/commerce'
import { loadFineArtVariants, fineArtPublic } from '@/lib/productCatalog/commerce.server'
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
    const variants = []
    for (let start = 0; ; start += batchSize) {
      const { data, error } = await supabase.from('artwork_prints')
        .select('*').eq('is_active', true).or('is_available.is.null,is_available.eq.true').gt('price', 0)
        .order('id').range(start, start + batchSize - 1)
      if (error) throw error
      variants.push(...(data || []).filter(isPurchasablePrintVariant))
      if (!data || data.length < batchSize) break
    }
    const config = await loadShippingSettings(serviceClient())
    const countryOptions = countryOptionsForItems(variants,config.globalCountries)
    const artworks = await getPublicPrintArtworks([...new Set(variants.map(v => v.artwork_id))])
    const parents=new Map(artworks.map(a=>[a.id,a]))
    const eligible = variants.map(v=>withShippingCountries(v,config,parents.get(v.artwork_id))).filter(v => itemAvailableInCountry(v,country))
    const commercial = await loadFineArtVariants(serviceClient(),config).catch(error => {
      console.error('[prints] Commercial discovery unavailable:', error?.code || error?.message)
      return []
    })
    const offered = commercial.filter(row => !country || fineArtCurrencies.some(currency => marketVariant(row,country,currency)))
    const independent = offered.map(row => ({
      ...fineArtPublic(row), artworkSku:row.artworkSku, edition:'OPEN', image:row.gallery[0].url, commercial:true,
    }))
    const countries = [...new Set([...countryOptions,...commercial.flatMap(row => row.countries)])].sort()
    if (!artworks.length) return { options: independent, countries }
    const ids = new Set(artworks.map(a => a.id))
    const media = await getPrintMediaMap(serviceClient(), artworks, eligible.filter(v => ids.has(v.artwork_id)))
    return { options: [...publicPrintOptions(artworks, media),...independent], countries }
  } catch (error) {
    console.error('[prints] Public print discovery failed:', error?.code || error?.message)
    return { options: [], countries: [] }
  }
}
