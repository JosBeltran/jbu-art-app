import { invalidatePrintDetail } from '@/lib/printDetailCache.server'
import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { isPrintId } from '@/lib/printManager'
import { PRINT_MASTER_BUCKET, PRINT_SOURCE_TYPES } from '@/lib/printAssetPresets'
import { printUploadPolicy } from '@/lib/printUploadPolicy.server'
import { PrintAssetError } from '@/lib/printAssetLayout'
import { inspectArtworkPrintMaster } from '@/lib/artworkPrintMaster.server'
import { removeFiles } from '@/lib/printAssetGeneration.server'

export const runtime = 'nodejs'
export const maxDuration = 120

async function run(request, action) {
  try {
    const { user } = await requireCertificateAdmin(request)
    return Response.json(await action(serviceClient(),user.id),{headers:{'Cache-Control':'no-store'}})
  } catch(error) {
    if(error instanceof HttpError || error instanceof PrintAssetError)
      return Response.json({error:error.code},{status:error.status,headers:{'Cache-Control':'no-store'}})
    if(['layout_changed','master_busy','master_already_exists','invalid_print_size'].includes(error?.message))
      return Response.json({error:error.message},{status:409,headers:{'Cache-Control':'no-store'}})
    console.error('[artwork print master]',error?.code || error?.name)
    return Response.json({error:'storage_failed'},{status:503,headers:{'Cache-Control':'no-store'}})
  }
}
async function context(db,id) {
  if(!isPrintId(id))throw new HttpError(400,'invalid_print')
  const {data:print,error}=await db.from('artwork_prints').select('id,artwork_id,title,size,size_code,paper_type,image_url')
    .eq('id',id).maybeSingle()
  if(error)throw error
  if(!print)throw new HttpError(404,'print_not_found')
  const {data:current,error:readError}=await db.from('print_asset_generations').select('*')
    .eq('print_id',id).eq('is_current',true).maybeSingle()
  if(readError)throw readError
  return {print,current}
}
export function GET(request) {
  return run(request,async db=>{
    const {print,current}=await context(db,new URL(request.url).searchParams.get('id'))
    return {print,hasMaster:Boolean(current?.production_file_path),
      revisionId:current?.revision_id || null,uploadPolicy:await printUploadPolicy(db)}
  })
}
export function POST(request) {
  return run(request,async(db,adminId)=>{
    const body=await request.json().catch(()=>null)
    if(!body || !['inspect','attach'].includes(body.action) || !isPrintId(body.uploadId) ||
      !PRINT_SOURCE_TYPES.includes(body.type))throw new HttpError(400,'invalid_upload')
    const {print,current}=await context(db,body.printId)
    if(current?.production_file_path) {
      if(body.action==='attach' && current.master_source_ref?.uploadId===body.uploadId) return {ready:true}
      throw new HttpError(409,'master_already_exists')
    }
    if((current?.revision_id || null)!==(body.revisionId || null))throw new HttpError(409,'layout_changed')
    const config={supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,siteUrl:process.env.NEXT_PUBLIC_SITE_URL}
    const result=await inspectArtworkPrintMaster(db,print,current,adminId,body.uploadId,config)
    if(body.action==='inspect')return {key:result.key,width:result.layout.width,height:result.layout.height,dpi:result.dpi,
      image:'data:image/webp;base64,'+result.thumbnail.toString('base64')}
    if(body.confirm!==true || body.key!==result.key)throw new HttpError(409,'preview_changed')
    const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/tiff':'tif'}
    const path='attached/'+print.artwork_id+'/'+print.id+'/'+body.uploadId+'/master.'+extensions[body.type]
    const bucket=db.storage.from(PRINT_MASTER_BUCKET)
    // Verify the object MIME against the inspected upload, rather than trusting the extension.
    const info=await bucket.info(result.staging)
    if(info.error || info.data?.contentType!==body.type)throw new HttpError(409,'upload_incomplete')
    const {error:copyError}=await bucket.copy(result.staging,path)
    if(copyError && !['Duplicate','KeyAlreadyExists','ResourceAlreadyExists'].includes(copyError.code) && Number(copyError.statusCode)!==409)
      throw new HttpError(503,'storage_failed')
    let commitSent=false
    try {
      commitSent=true
      const saved=await db.rpc('attach_artwork_print_master',{
        _print:print.id,_expected:current?.revision_id || null,_size:result.size,_path:path,_request:body.uploadId,_by:adminId,
        _sha:result.sha,_layout:result.layout,_dpi:Math.round(result.dpi),
      })
      if(saved.error) {
        commitSent=!/^[0-9A-Z]{5}$/.test(saved.error.code || '')
        throw saved.error
      }
      if(!saved.data?.revisionId)throw new HttpError(503,'storage_failed')
      invalidatePrintDetail()
      await removeFiles(bucket,[result.staging])
      return {ready:true,printId:print.id,revisionId:saved.data.revisionId}
    } finally {
      // Keep a potentially committed file when the RPC response is lost.
      if(!commitSent)await removeFiles(bucket,[path])
    }
  })
}

