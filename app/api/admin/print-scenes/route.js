import sharp from 'sharp'
import {randomUUID} from 'node:crypto'
import {requireCertificateAdmin,serviceClient,HttpError} from '@/lib/certificates/adminAuth.server'
import {isCommerceId} from '@/lib/productCatalog/commerce'
import {initialRoomPlacement,roomPlacement} from '@/lib/productCatalog/roomScene'
import {adminTargetColumns,sceneColumns,sceneUrl} from '@/lib/productCatalog/roomScene.server'
import {checked} from '@/lib/productCatalog/service'

const maxBytes=4*1024*1024
const invalid=()=>new HttpError(400,'invalid_scene')
const text=(value,max)=>typeof value==='string' && value.trim().length<=max ? value.trim() : ''
const scopes={artwork:'artwork_id',product:'product_id',family:'family_code'}

async function admin(request,action) {
  try {
    await requireCertificateAdmin(request)
    return Response.json(await action(serviceClient()))
  } catch(error) {
    if (error?.code==='23505') return Response.json({error:'scene_target_already_assigned'},{status:409})
    if (error?.code==='23503') return Response.json({error:'invalid_scene_target'},{status:400})
    return Response.json({error:error instanceof HttpError ? error.code : 'scene_unavailable'},
      {status:error instanceof HttpError ? error.status : 503})
  }
}

export function GET(request) {
  return admin(request,async db=>{
    const {searchParams}=new URL(request.url)
    const scope=searchParams.get('scope'), query=text(searchParams.get('query'),120).replace(/[\\%_]/g,' ')
    if (scope==='artwork') return {matches:await checked(db.from('artworks').select('id,sku,title').ilike('title',`%${query}%`).order('title').limit(25))}
    if (scope==='product') return {matches:await checked(db.from('products').select('id,sku,title_es').ilike('title_es',`%${query}%`).order('title_es').limit(25))}
    const [scenes,families]=await Promise.all([
      checked(db.from('print_room_scenes').select(`${sceneColumns},print_room_scene_targets(${adminTargetColumns})`).order('name').limit(200)),
      checked(db.from('product_families').select('code,label_es,label_en').order('code')),
    ])
    return {scenes:scenes.map(scene=>({...scene,url:sceneUrl(db,scene.object_path)})),families}
  })
}

export function POST(request) {
  return admin(request,async db=>{
    if (Number(request.headers.get('content-length'))>maxBytes+16384) throw new HttpError(413,'scene_image_too_large')
    const form=await request.formData()
    const file=form.get('file'), name=text(form.get('name'),120), license=text(form.get('license'),500)
    if (!(file instanceof File) || !name || !license || file.size>maxBytes) throw invalid()
    const image=sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:32_000_000})
    const metadata=await image.metadata().catch(()=>null)
    if (!metadata || !['jpeg','webp'].includes(metadata.format) || (metadata.pages ?? 1)!==1) throw invalid()
    const {data,info}=await image.rotate().resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true})
      .toColourspace('srgb').webp({quality:86}).toBuffer({resolveWithObject:true}).catch(()=>{throw invalid()})
    const storage=db.storage.from('artworks')
    const object_path=`print-room-scenes/${randomUUID()}.webp`
    const uploaded=await storage.upload(object_path,data,{contentType:'image/webp',cacheControl:'31536000'})
    if (uploaded.error) throw uploaded.error
    const inserted=await db.from('print_room_scenes').insert({name,license,object_path,width:info.width,height:info.height,
      placement:initialRoomPlacement}).select(sceneColumns).single()
    if (inserted.error) {
      if (/^23/.test(inserted.error.code || '')) await storage.remove([object_path])
      throw inserted.error
    }
    return {scene:{...inserted.data,url:sceneUrl(db,object_path),print_room_scene_targets:[]}}
  })
}

export function PATCH(request) {
  return admin(request,async db=>{
    const body=await request.json().catch(()=>null)
    if (!isCommerceId(body?.id)) throw invalid()
    const {id,action}=body
    if (action==='assign') {
      const column=Object.hasOwn(scopes,body.scope) ? scopes[body.scope] : null
      if (body.scope!=='global' && (!column || (column==='family_code' ? !/^[a-z][a-z0-9_]{1,49}$/.test(body.target) : !isCommerceId(body.target)))) throw invalid()
      const assignment=column ? {[column]:body.target} : {}
      return {target:await checked(db.from('print_room_scene_targets').insert({scene_id:id,...assignment}).select(adminTargetColumns).single())}
    }
    if (action==='unassign') {
      if (!isCommerceId(body.target)) throw invalid()
      const removed=await checked(db.from('print_room_scene_targets').delete().eq('id',body.target).eq('scene_id',id).select('id'))
      if (!removed.length) throw new HttpError(404,'scene_target_not_found')
      return {removed:true}
    }
    const placement=roomPlacement(body.placement),name=text(body.name,120),license=text(body.license,500)
    if (action!=='save' || !name || !license || !placement || !Number.isSafeInteger(body.revision) || body.revision<1 ||
      typeof body.active!=='boolean' || (body.family!==null && !/^[a-z][a-z0-9_]{1,49}$/.test(body.family))) throw invalid()
    const row=await checked(db.from('print_room_scenes').update({
      name,license,placement,description:text(body.description,1000),category:text(body.category,80),family:body.family,
      active:body.active,revision:body.revision+1,updated_at:new Date().toISOString(),
    }).eq('id',id).eq('revision',body.revision).select(sceneColumns).maybeSingle())
    if (!row) throw new HttpError(409,'scene_revision_changed')
    return {scene:{...row,url:sceneUrl(db,row.object_path)}}
  })
}
