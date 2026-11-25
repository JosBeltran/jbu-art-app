import {readPublicSource} from './printAssetGeneration.server.js'
import {inspectPrintSource} from './printAssetRender.server.js'
import {printOrientation} from './printPresentation.js'

const cache=new Map()
export async function printImageMetadata(url,config={supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,siteUrl:process.env.NEXT_PUBLIC_SITE_URL}) {
  if(!url)return null
  const key=String(url),old=cache.get(key)
  if(old && old.until>Date.now())return old.promise
  const promise=(async()=>{
    const bytes=await readPublicSource(url,config,fetch)
    const meta=await inspectPrintSource(bytes)
    return {width_px:meta.width,height_px:meta.height,orientation:printOrientation(meta.width,meta.height)}
  })().catch(()=>null)
  if(cache.size>=100)cache.delete(cache.keys().next().value)
  cache.set(key,{until:Date.now()+300000,promise})
  return promise
}
export async function availablePrintMetadata(db,artworkId,rows) {
  const {data:artwork}=await db.from('artworks').select('primary_image_url').eq('id',artworkId).maybeSingle()
  const result=[]
  for(const row of rows) {
    let preview=row.image_url
    if(!preview && (row.print_gallery_image_id || row.print_provenance_image_id)) {
      const gallery=Boolean(row.print_gallery_image_id)
      const {data}=await db.from(gallery ? 'artwork_images' : 'provenance_event_images_public')
        .select('image_url').eq('artwork_id',artworkId).eq('id',row.print_gallery_image_id || row.print_provenance_image_id).maybeSingle()
      preview=data?.image_url
    }
    const meta=row.orientation ? null : await printImageMetadata(preview || artwork?.primary_image_url)
    result.push({...row,orientation:row.orientation || meta?.orientation || null,preview_url:preview || artwork?.primary_image_url || null})
  }
  return result
}

