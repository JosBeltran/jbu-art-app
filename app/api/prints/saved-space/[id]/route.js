import {getRequestUser,serviceClient} from '@/lib/offersAuth'
import {loadShippingSettings} from '@/lib/shippingSettings.server'
import {fineArtPublic,loadFineArtVariants} from '@/lib/productCatalog/commerce.server'
import {loadPrintRoomScenes} from '@/lib/productCatalog/roomScene.server'
import {isCommerceId} from '@/lib/productCatalog/commerce'
import {maxWallItems} from '@/lib/productCatalog/wallSpace'
import {resolveMediaUrl} from '@/lib/artworkMedia'

const headers={'Cache-Control':'private, no-store'}

export async function GET(request,{params}) {
  try {
    const {id}=await params
    if(!isCommerceId(id))return Response.json({error:'not_found'},{status:404,headers})
    const db=serviceClient()
    const user=await getRequestUser(request,db)
    if(!user)return Response.json({error:'sign_in_required'},{status:401,headers})
    const {data,error}=await db.from('saved_curated_spaces').select('id,name,composition,photo_data')
      .eq('id',id).eq('owner_id',user.id).maybeSingle()
    if(error)throw error
    if(!data)return Response.json({error:'not_found'},{status:404,headers})
    const {sourceArtworkId,items}=data.composition
    if(!isCommerceId(sourceArtworkId) || !Array.isArray(items) || items.length>maxWallItems ||
      items.some(item=>!isCommerceId(item?.artworkId) || (item.variantId && !isCommerceId(item.variantId))))
      return Response.json({error:'invalid_composition'},{status:422,headers})
    const artworkIds=[...new Set([sourceArtworkId,...items.map(item=>item.artworkId)])]
    const shipping=await loadShippingSettings(db)
    const [variants,artworks]=await Promise.all([
      loadFineArtVariants(db,shipping,{artworkIds}),
      db.from('artworks_discoverable').select('id,title,title_en,primary_image_url').in('id',artworkIds),
    ])
    if(artworks.error)throw artworks.error
    const publicVariants=variants.map(fineArtPublic)
    const rooms=await Promise.all(artworks.data.map(artwork=>loadPrintRoomScenes(
      db,artwork.id,publicVariants.filter(row=>row.artworkId===artwork.id),artwork.primary_image_url,
    ).catch(()=>({scenes:[],sources:{}}))))
    return Response.json({saved:data,variants:publicVariants,artworks:artworks.data.map(row=>({
      id:row.id,title:row.title,titleEn:row.title_en,image:resolveMediaUrl(row.primary_image_url),
    })),roomScenes:{scenes:rooms.flatMap(room=>room.scenes),sources:Object.assign({},...rooms.map(room=>room.sources))}},{headers})
  } catch(error) {
    console.error('[saved curated space]',error?.code || error?.message)
    return Response.json({error:'space_unavailable'},{status:503,headers})
  }
}
