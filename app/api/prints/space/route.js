import {resolveMediaUrl} from '@/lib/artworkMedia'
import {serviceClient} from '@/lib/offersAuth'
import {cachePrintDetail} from '@/lib/printDetailCache.server'
import {loadShippingSettings} from '@/lib/shippingSettings.server'
import {checked} from '@/lib/productCatalog/service'
import {loadFineArtVariants} from '@/lib/productCatalog/commerce.server'
import {loadPrintRoomScenes} from '@/lib/productCatalog/roomScene.server'
import {matchingRoomScenes} from '@/lib/productCatalog/roomScene'
import {isCommerceId} from '@/lib/productCatalog/commerce'
import {printOrientation} from '@/lib/printPresentation'
import {originalWallGeometry} from '@/lib/productCatalog/wallSpace'

const loadMasterFormats=cachePrintDetail('wall-master-formats',async ids=>{
  const db=serviceClient()
  const rows=await checked(db.from('print_asset_generations').select(`
    artwork_id,master_approved_at,assessed:master_source_ref->effectiveDpi,
    width:layout->paperWidthMm,height:layout->paperHeightMm,margins:layout->marginsMm,border:layout->borderSpec
  `).in('artwork_id',ids).eq('is_current',true).eq('production_status','MASTER_READY')
    .not('production_file_path','is',null))
  const formats=Object.fromEntries(ids.map(id=>[id,[]]))
  for(const row of rows) {
    const widthMm=Number(row.width),heightMm=Number(row.height)
    const orientation=printOrientation(widthMm,heightMm)
    const margins=['top','right','bottom','left'].map(edge=>Number(row.margins?.[edge]))
    if(!orientation || !(row.master_approved_at || Number(row.assessed)>0) ||
      !margins.every(Number.isFinite))continue
    const borderMm=row.border?.unit==='percent' ? Number(row.border.value)*Math.min(widthMm,heightMm)/100
      : row.border?.unit==='mm' ? Number(row.border.value) : row.border?.unit==='none' ? 0 : Math.min(...margins)
    if(Number.isFinite(borderMm))formats[row.artwork_id].push({widthMm,heightMm,orientation,borderMm})
  }
  return formats
})

const loadSpace=cachePrintDetail('wall-space-v2',async id=>{
  const db=serviceClient()
  const source=await checked(db.from('artworks_discoverable')
    .select('id,sku,title,title_en,series,dimensions,primary_image_url,is_historical_version,version_kind,version_published_at,version_parent_id')
    .eq('id',id).maybeSingle())
  if(!source) return null
  const pool=()=>db.from('artworks_discoverable').select('id,series,primary_image_url,version_parent_id')
    .eq('allows_prints',true).neq('id',id).order('id')
  const root=source.version_parent_id || id
  const [versions,same,more,shipping,rooms]=await Promise.all([
    checked(pool().or(`id.eq.${root},version_parent_id.eq.${root},version_parent_id.eq.${id}`).limit(8)),
    source.series ? checked(pool().eq('series',source.series).limit(16)) : [],
    checked(pool().limit(24)),
    loadShippingSettings(db),
    loadPrintRoomScenes(db,id,[{productFamily:'original'}],null).catch(()=>null),
  ])
  const artworks=new Map([...versions,...same,...more].map(row=>[row.id,row]))
  const ids=[...artworks.keys()].slice(0,48)
  const candidates=ids.length ? await loadFineArtVariants(db,shipping,{
    artworkIds:ids,listing:true,deferPriceValidity:true,maxVariants:1200,onPartialError:error=>{throw error},
  }) : []
  const groups=new Map()
  for(const item of candidates) {
    if(!item.previewGeometry) continue
    if(!groups.has(item.artworkId)) groups.set(item.artworkId,[])
    const group=groups.get(item.artworkId)
    const {widthMm,heightMm,borderMm,fit}=item.previewGeometry
    const {id,artworkId,artworkTitle,artworkTitleEn,productId,productFamily,series,size,attributes,
      countries,priceBooks,entries,presentationBorder,frameProfile}=item
    group.push({id,artworkId,artworkTitle,artworkTitleEn,productId,productFamily,series,size,attributes,
      countries,priceBooks,entries,presentationBorder,frameProfile,previewGeometry:{widthMm,heightMm,borderMm,fit},
      gallery:item.gallery.slice(0,1),spaceImage:resolveMediaUrl(artworks.get(artworkId)?.primary_image_url)})

  }
  const originalGeometry=!source.is_historical_version &&
    (source.version_kind!=='SUCCESSOR' || source.version_published_at) && originalWallGeometry(source.dimensions)
  return {
    original:originalGeometry && source.primary_image_url ? {title:source.title,titleEn:source.title_en,
      artworkId:id,image:resolveMediaUrl(source.primary_image_url),geometry:originalGeometry} : null,
    scenes:rooms ? matchingRoomScenes(rooms.scenes,{artworkId:id,productFamily:'original'}) : [],
    sourceSeries:source.series,
    lineage:Object.fromEntries([source,...artworks.values()].map(row=>[row.id,
      row.version_parent_id===id ? root : row.version_parent_id || row.id])),
    related:ids.filter(artwork=>groups.has(artwork)).map(artwork=>groups.get(artwork)),
  }
})

export async function GET(request) {
  const id=new URL(request.url).searchParams.get('artwork')
  if(!isCommerceId(id))return Response.json({error:'invalid_artwork'},{status:400})
  try {
    const data=await loadSpace(id)
    if(!data)return Response.json({error:'artwork_unavailable'},{status:404})
    const ids=[id,...data.related.map(group=>group[0].artworkId)].sort()
    const masters=await loadMasterFormats(ids).catch(error=>{
      console.error('[print-space masters]',error?.code || error?.message)
      return null
    })
    return Response.json({...data,masters})
  } catch(error) {
    console.error('[print-space]',error?.code || error?.message)
    return Response.json({error:'space_unavailable'},{status:503})
  }
}
