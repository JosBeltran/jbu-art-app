import {createHash} from 'node:crypto'
import {resolveMediaUrl} from '@/lib/artworkMedia'
import {getRequestUser,serviceClient} from '@/lib/offersAuth'
import {cachePrintDetail} from '@/lib/printDetailCache.server'
import {loadShippingSettings} from '@/lib/shippingSettings.server'
import {checked} from '@/lib/productCatalog/service'
import {loadFineArtVariants} from '@/lib/productCatalog/commerce.server'
import {loadPrintRoomScenes} from '@/lib/productCatalog/roomScene.server'
import {matchingRoomScenes} from '@/lib/productCatalog/roomScene'
import {resolveWallPrintSpecification,wallPrintPage,wallPrintSpecification} from '@/lib/productCatalog/wallPrintChoices'
import {isCommerceId,fineArtCurrencies,marketVariant} from '@/lib/productCatalog/commerce'
import {customerPrintChoices} from '@/lib/productCatalog/customerPrintConfiguration'
import {inquiryArtworkUrl} from '@/lib/inquiry'
import {availablePrintMetadata} from '@/lib/printImageMetadata.server'
import {maxWallItems,originalWallGeometry} from '@/lib/productCatalog/wallSpace'

const loadArtworkPrintFormats=cachePrintDetail('wall-artwork-print-formats',async ids=>{
  const db=serviceClient()
  const rows=await checked(db.from('artwork_prints')
    .select('artwork_id,size,size_code,orientation,border_unit,border_value,image_url,print_gallery_image_id,print_provenance_image_id')
    .in('artwork_id',ids))
  return Object.fromEntries(await Promise.all(ids.map(async id=>{
    const entries=rows.filter(row=>row.artwork_id===id)
    const legacy=entries.filter(row=>!row.orientation)
    const resolved=legacy.length ? await availablePrintMetadata(db,id,legacy) : []
    const formats=[...entries.filter(row=>row.orientation),...resolved]
      .map(({size,size_code,orientation,border_unit,border_value})=>({size,size_code,orientation,border_unit,border_value}))
    return [id,formats]
  })))
})

const loadWallCatalog=cachePrintDetail('wall-catalog-v1',async ()=>{
  const db=serviceClient()
  const shipping=await loadShippingSettings(db)
  const [candidates,series]=await Promise.all([
    loadFineArtVariants(db,shipping,{listing:true,deferPriceValidity:true,onPartialError:error=>{throw error}}),
    checked(db.from('series').select('id,title')),
  ])
  const seriesTitles=new Map(series.map(row=>[row.id,row.title]))
  const artworkIds=[...new Set(candidates.map(item=>item.artworkId))]
  const artworks=new Map()
  for(let start=0;start<artworkIds.length;start+=150) {
    const rows=await checked(db.from('artworks_discoverable').select(
      'id,series_id,series,primary_image_url,version_parent_id'
    ).in('id',artworkIds.slice(start,start+150)))
    for(const row of rows)artworks.set(row.id,row)
  }
  const groups=new Map()
  for(const item of candidates) {
    const artwork=artworks.get(item.artworkId)
    if(!artwork || !(item.previewGeometry?.widthMm>0 && item.previewGeometry?.heightMm>0))continue
    if(!groups.has(item.artworkId))groups.set(item.artworkId,[])
    const {widthMm,heightMm,borderMm,fit}=item.previewGeometry
    const {id,artworkId,artworkSku,artworkTitle,artworkTitleEn,productId,productFamily,size,attributes,
      countries,priceBooks,entries,presentationBorder,frameProfile}=item
    groups.get(artworkId).push({id,artworkId,artworkSku,artworkTitle,artworkTitleEn,productId,productFamily,size,attributes,
      series:seriesTitles.get(artwork.series_id) || artwork.series,seriesId:artwork.series_id,lineage:artwork.version_parent_id || artworkId,
      countries,priceBooks,entries,presentationBorder,frameProfile,previewGeometry:{widthMm,heightMm,borderMm,fit},
      gallery:item.gallery.slice(0,1),spaceImage:resolveMediaUrl(artwork.primary_image_url)})
  }
  return [...groups.values()]
})

const loadSpace=cachePrintDetail('wall-space-v3',async id=>{
  const db=serviceClient()
  const source=await checked(db.from('artworks_discoverable')
    .select('id,title,title_en,series,series_id,dimensions,primary_image_url,is_historical_version,version_kind,version_published_at,version_parent_id')
    .eq('id',id).maybeSingle())
  if(!source) return null
  const [rooms,series]=await Promise.all([
    loadPrintRoomScenes(db,id,[{productFamily:'original'}],null).catch(()=>null),
    source.series_id ? checked(db.from('series').select('title').eq('id',source.series_id).maybeSingle()) : null,
  ])
  const originalGeometry=!source.is_historical_version &&
    (source.version_kind!=='SUCCESSOR' || source.version_published_at) && originalWallGeometry(source.dimensions)
  return {
    original:originalGeometry && source.primary_image_url ? {title:source.title,titleEn:source.title_en,
      artworkId:id,image:resolveMediaUrl(source.primary_image_url),geometry:originalGeometry} : null,
    scenes:rooms ? matchingRoomScenes(rooms.scenes,{artworkId:id,productFamily:'original'}) : [],
    sourceSeries:series?.title || source.series,
    sourceSeriesId:source.series_id,
    root:source.version_parent_id || id,
  }
})

export async function GET(request) {
  const {searchParams}=new URL(request.url)
  const id=searchParams.get('artwork')
  const country=searchParams.get('country')
  const currency=searchParams.get('currency')
  const referenceId=searchParams.get('reference') || id
  const offset=Number(searchParams.get('offset') || 0)
  if(!isCommerceId(id) || !isCommerceId(referenceId) || !/^[A-Z]{2}$/.test(country || '') ||
    !fineArtCurrencies.includes(currency) || !Number.isSafeInteger(offset) || offset<0)
    return Response.json({error:'invalid_search'},{status:400})
  try {
    const [data,catalog]=await Promise.all([loadSpace(id),loadWallCatalog()])
    if(!data)return Response.json({error:'artwork_unavailable'},{status:404})
    const reference=catalog.find(group=>group[0].artworkId===referenceId)?.[0] ||
      {series:data.sourceSeries,seriesId:data.sourceSeriesId,lineage:data.root}
    const {related,facets,nextOffset}=wallPrintPage(catalog,{reference,referenceId,country,currency,offset,searchParams})
    const ids=[...new Set([id,...related.map(group=>group[0].artworkId)])].sort()
    const artworkPrintFormats=await loadArtworkPrintFormats(ids).catch(error=>{
      console.error('[print-space artwork prints]',error?.code || error?.message)
      return null
    })
    const lineage=Object.fromEntries(related.map(group=>[group[0].artworkId,group[0].lineage]))
    lineage[id]=data.root
    lineage[referenceId]=reference.lineage
    return Response.json({...data,related,lineage,artworkPrintFormats,facets,nextOffset})
  } catch(error) {
    console.error('[print-space]',error?.code || error?.message)
    return Response.json({error:'space_unavailable'},{status:503})
  }
}


export async function POST(request) {
  const body=await request.json().catch(()=>null)
  const {country,currency,requests,locale}=body || {}
  if(typeof country!=='string' || !/^[A-Z]{2}$/.test(country) || !fineArtCurrencies.includes(currency) ||
    !Array.isArray(requests) || !requests.length || requests.length>maxWallItems ||
    requests.some(item=>!isCommerceId(item?.variantId) || !isCommerceId(item?.referenceVariantId))) {
    return Response.json({error:'invalid_variant_requests'},{status:400})
  }
  try {
    const db=serviceClient()
    const user=await getRequestUser(request,db)
    if(!user)return Response.json({error:'sign_in_required'},{status:401})
    const groups=await loadWallCatalog()
    const byVariant=new Map(groups.flatMap(group=>group.map(row=>[row.id,{row,group}])))
    const entries=requests.map(({variantId,referenceVariantId})=>({
      piece:byVariant.get(variantId),reference:byVariant.get(referenceVariantId)?.row,
    }))
    const ids=[...new Set(entries.map(({piece})=>piece?.row.artworkId).filter(Boolean))].sort()
    const artworkPrintFormats=ids.length ? await loadArtworkPrintFormats(ids) : {}
    const records=new Map()
    let skipped=0
    for(const {piece,reference} of entries) {
      const target=wallPrintSpecification(reference)
      if(!piece || !target || !marketVariant(reference,country,currency) ||
        resolveWallPrintSpecification(piece.group,piece.row,target,reference.previewGeometry,
          artworkPrintFormats[piece.row.artworkId],country,currency).status!=='pending') {
        skipped++
        continue
      }
      const {artworkId,artworkSku,artworkTitle}=piece.row
      const spec=JSON.stringify({country,currency,...target,orientation:customerPrintChoices(piece.row).orientation})
      const hash=createHash('sha256').update(JSON.stringify([user.id,artworkId,spec])).digest('hex')
      const id=[hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20,32)].join('-')
      const quantity=(records.get(id)?.quantity || 0)+1
      records.set(id,{quantity,row:{id,artwork_id:artworkId,sku:artworkSku,title:artworkTitle,artwork_url:inquiryArtworkUrl(artworkSku),channel:'INTERNAL',
        user_id:user.id,email:user.email || null,locale:String(locale).startsWith('en')?'en':'es',
        message:`Fine Art print variant request · ${quantity} × ${spec}`}})
    }
    if(records.size)await checked(db.from('artwork_inquiries').upsert([...records.values()].map(({row})=>row),
      {onConflict:'id',ignoreDuplicates:true}))
    return Response.json({ok:true,skipped})
  } catch(error) {
    console.error('[print-space requests]',error?.code || error?.message)
    return Response.json({error:'variant_requests_unavailable'},{status:503})
  }
}
