import {resolveMediaUrl} from '@/lib/artworkMedia'
import {serviceClient} from '@/lib/offersAuth'
import {cachePrintDetail} from '@/lib/printDetailCache.server'
import {loadShippingSettings} from '@/lib/shippingSettings.server'
import {checked} from '@/lib/productCatalog/service'
import {loadFineArtVariants,fineArtPublic} from '@/lib/productCatalog/commerce.server'
import {loadPrintRoomScenes} from '@/lib/productCatalog/roomScene.server'
import {matchingRoomScenes} from '@/lib/productCatalog/roomScene'
import {isCommerceId} from '@/lib/productCatalog/commerce'
import {originalWallGeometry} from '@/lib/productCatalog/wallSpace'

const loadSpace=cachePrintDetail('wall-space',async id=>{
  const db=serviceClient()
  const source=await checked(db.from('artworks_discoverable')
    .select('id,sku,title,title_en,series,dimensions,primary_image_url,is_historical_version,version_kind,version_published_at')
    .eq('id',id).maybeSingle())
  if(!source) return null
  const pool=()=>db.from('artworks_discoverable').select('id,series,primary_image_url')
    .eq('allows_prints',true).neq('id',id).order('id')
  const [same,more,shipping,rooms]=await Promise.all([
    source.series ? checked(pool().eq('series',source.series).limit(12)) : [],
    checked(pool().limit(16)),
    loadShippingSettings(db),
    loadPrintRoomScenes(db,id,[{productFamily:'original'}],null).catch(()=>null),
  ])
  const artworks=new Map([...same,...more].map(row=>[row.id,row]))
  const ids=[...artworks.keys()].slice(0,22)
  const candidates=ids.length ? await loadFineArtVariants(db,shipping,{
    artworkIds:ids,listing:true,deferPriceValidity:true,maxVariants:160,onPartialError:error=>{throw error},
  }) : []
  const groups=new Map()
  for(const item of candidates) {
    if(!item.previewGeometry) continue
    if(!groups.has(item.artworkId)) groups.set(item.artworkId,[])
    const group=groups.get(item.artworkId)
    if(group.length<24) group.push({...fineArtPublic(item),gallery:item.gallery.slice(0,1),spaceImage:resolveMediaUrl(artworks.get(item.artworkId)?.primary_image_url)})
  }
  const originalGeometry=!source.is_historical_version &&
    (source.version_kind!=='SUCCESSOR' || source.version_published_at) && originalWallGeometry(source.dimensions)
  return {
    original:originalGeometry && source.primary_image_url ? {title:source.title,titleEn:source.title_en,
      artworkId:id,image:resolveMediaUrl(source.primary_image_url),geometry:originalGeometry} : null,
    scenes:rooms ? matchingRoomScenes(rooms.scenes,{artworkId:id,productFamily:'original'}) : [],
    related:ids.filter(artwork=>groups.has(artwork)).slice(0,8).map(artwork=>groups.get(artwork)),
  }
})

export async function GET(request) {
  const id=new URL(request.url).searchParams.get('artwork')
  if(!isCommerceId(id))return Response.json({error:'invalid_artwork'},{status:400})
  try {
    const data=await loadSpace(id)
    return data ? Response.json(data) : Response.json({error:'artwork_unavailable'},{status:404})
  } catch(error) {
    console.error('[print-space]',error?.code || error?.message)
    return Response.json({error:'space_unavailable'},{status:503})
  }
}
