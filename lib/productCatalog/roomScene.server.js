import 'server-only'
import {checked} from './service.js'
import {roomPlacement} from './roomScene.js'

export const sceneColumns='id,name,description,category,license,object_path,width,height,placement,family,active,revision'
export const targetColumns='id,scene_id,artwork_id,product_id,family_code'
export const adminTargetColumns=targetColumns+',artworks(title,sku),products(title_es,sku)'
export const sceneUrl=(db,path)=>db.storage.from('artworks').getPublicUrl(path).data.publicUrl

export async function loadPrintRoomScenes(db,artworkId,variants,publicPrimary) {
  const products=[...new Set(variants.map(row=>row.productId))]
  const families=[...new Set(variants.map(row=>row.productFamily))].filter(code=>/^[a-z][a-z0-9_]+$/.test(code))
  const selectors=[`artwork_id.eq.${artworkId}`,`product_id.in.(${products.join(',')})`,
    'and(artwork_id.is.null,product_id.is.null,family_code.is.null)']
  if (families.length) selectors.push(`family_code.in.(${families.join(',')})`)
  const rows=await checked(db.from('print_room_scene_targets')
    .select(`${targetColumns},print_room_scenes!inner(id,name,object_path,width,height,placement,family,revision)`)
    .eq('print_room_scenes.active',true).or(selectors.join(',')))
  const scenes=new Map()
  for (const {print_room_scenes:scene,...target} of rows) {
    const placement=roomPlacement(scene.placement)
    if (!placement) continue
    if (!scenes.has(scene.id)) scenes.set(scene.id,{
      id:scene.id,name:scene.name,width:scene.width,height:scene.height,placement,family:scene.family,
      revision:scene.revision,url:sceneUrl(db,scene.object_path),targets:[],
    })
    scenes.get(scene.id).targets.push(target)
  }
  if (!scenes.size) return {scenes:[],sources:{}}
  const ids=variants.filter(row=>row.previewGeometry).map(row=>row.id)
  const sources={}
  // Existing RPC verifies session ownership, exact artwork and public preview eligibility.
  for (let offset=0;offset<ids.length;offset+=80) {
    const batch=ids.slice(offset,offset+80)
    const {data,error}=await db.rpc('fine_art_studio_default_mockups',{_variants:batch}).select('variant_id,source_url')
    if (error && !['PGRST202','42883'].includes(error.code)) throw error
    for (const row of data || []) sources[row.variant_id]=row.source_url
    const missing=batch.filter(id=>!sources[id])
    if (!publicPrimary || !missing.length) continue
    // Older schemas can still use the exact published artwork image if Studio
    // explicitly saved that same source for an already eligible variant.
    const exactPrimary=await checked(db.from('wall_art_mockups').select('variant_id')
      .in('variant_id',missing).eq('source_url',publicPrimary))
    for (const row of exactPrimary) sources[row.variant_id]=publicPrimary
  }
  return {scenes:[...scenes.values()],sources}
}
