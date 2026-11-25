import {requireCertificateAdmin,serviceClient,HttpError} from '@/lib/certificates/adminAuth.server'
import {isPrintId} from '@/lib/printManager'
import {PRINT_MASTER_BUCKET} from '@/lib/printAssetPresets'
import {printUploadPolicy} from '@/lib/printUploadPolicy.server'
import {PrintAssetError} from '@/lib/printAssetLayout'
import {loadPreparedFiles} from '@/lib/preparedPrintFiles.server'
import {removeFiles,printStagingPath} from '@/lib/printAssetGeneration.server'

export const runtime='nodejs'
export const maxDuration=120
async function execute(request,action) {
  try {
    const {user}=await requireCertificateAdmin(request)
    return Response.json(await action(serviceClient(),user.id),{headers:{'Cache-Control':'no-store'}})
  } catch(error) {
    if(error instanceof HttpError || error instanceof PrintAssetError)
      return Response.json({error:error.code},{status:error.status,headers:{'Cache-Control':'no-store'}})
    if(['layout_changed','print_specs_locked','master_already_exists','print_identity_locked'].includes(error?.message))
      return Response.json({error:error.message},{status:409,headers:{'Cache-Control':'no-store'}})
    console.error('[prepared print files]',error?.code || error?.name)
    return Response.json({error:'storage_failed'},{status:503,headers:{'Cache-Control':'no-store'}})
  }
}
async function context(db,id) {
  if(!isPrintId(id))throw new HttpError(400,'invalid_print')
  const {data:print,error}=await db.from('artwork_prints')
    .select('id,artwork_id,title,size,size_code,paper_type,image_url,orientation,border_unit,border_value,preview_is_prepared')
    .eq('id',id).maybeSingle()
  if(error)throw error
  if(!print)throw new HttpError(404,'print_not_found')
  const current=await db.from('print_asset_generations').select('*').eq('print_id',id).eq('is_current',true).maybeSingle()
  if(current.error)throw current.error
  return {print,current:current.data}
}
export function GET(request) {
  return execute(request,async db=>{
    const {print,current}=await context(db,new URL(request.url).searchParams.get('id'))
    return {print,hasMaster:Boolean(current?.production_file_path),hasPreview:Boolean(print.image_url),
      revisionId:current?.revision_id || null,uploadPolicy:await printUploadPolicy(db)}
  })
}
export function POST(request) {
  return execute(request,async(db,admin)=>{
    const input=await request.json().catch(()=>null)
    if(!input || !['inspect','save'].includes(input.action) ||
      (!input.previewUploadId && !input.masterUploadId) ||
      [input.previewUploadId,input.masterUploadId].some(id=>id!=null && !isPrintId(id)))
      throw new HttpError(400,'invalid_upload')
    const {print,current}=await context(db,input.printId)
    if(current?.production_file_path) {
      if(input.action==='save' && current.master_source_ref?.uploadId===input.masterUploadId)return {saved:true}
      throw new HttpError(409,'master_already_exists')
    }
    if((current?.revision_id || null)!==(input.revisionId || null))throw new HttpError(409,'layout_changed')
    const config={supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,siteUrl:process.env.NEXT_PUBLIC_SITE_URL}
    const plan=await loadPreparedFiles(db,print,current,admin,input,config)
    if(input.action==='inspect')return {key:plan.key,image:'data:image/webp;base64,'+plan.publicPreview.toString('base64'),
      width:plan.masterMeta?.width || plan.previewMeta.width,height:plan.masterMeta?.height || plan.previewMeta.height,
      orientation:plan.orientation,dpi:plan.dpi,marginsMm:plan.layout.marginsMm,hasMaster:Boolean(input.masterUploadId)}
    if(input.confirm!==true || plan.key!==input.key)throw new HttpError(409,'preview_changed')
    const requestId=input.previewUploadId || input.masterUploadId
    const previewPath='print-previews/'+print.artwork_id+'/prepared/'+print.id+'/'+requestId+'/preview.webp'
    const masterPath=input.masterUploadId ? 'attached/'+print.artwork_id+'/'+print.id+'/'+input.masterUploadId+'/master' : null
    const masters=db.storage.from(PRINT_MASTER_BUCKET),previews=db.storage.from('artworks')
    let commitSent=false
    try {
      if(masterPath) {
        const copied=await masters.copy(printStagingPath(print.artwork_id,admin,input.masterUploadId),masterPath)
        if(copied.error && !['Duplicate','KeyAlreadyExists','ResourceAlreadyExists'].includes(copied.error.code) && Number(copied.error.statusCode)!==409)
          throw new HttpError(503,'storage_master_copy_failed')
      }
      const uploaded=await previews.upload(previewPath,plan.publicPreview,{contentType:'image/webp',upsert:false,cacheControl:'31536000'})
      if(uploaded.error && !['Duplicate','KeyAlreadyExists','ResourceAlreadyExists'].includes(uploaded.error.code) && Number(uploaded.error.statusCode)!==409)
        throw new HttpError(503,'storage_preview_failed')
      const previewUrl=previews.getPublicUrl(previewPath).data.publicUrl
      commitSent=true
      const result=await db.rpc('commit_prepared_print_files',{_print:print.id,_expected:current?.revision_id || null,
        _request:requestId,_by:admin,_preview:previewUrl,_master:masterPath,_layout:plan.layout,
        _source:{kind:'prepared_files',previewSha:plan.previewSha,sha256:plan.masterSha || plan.previewSha,
          uploadId:input.masterUploadId || null,effectiveDpi:plan.dpi},
        _new_preview:Boolean(input.previewUploadId),_preview_width:plan.previewMeta?.width || plan.masterMeta.width,
        _preview_height:plan.previewMeta?.height || plan.masterMeta.height})
      if(result.error) {
        commitSent=!/^[0-9A-Z]{5}$/.test(result.error.code || '')
        throw result.error
      }
      if(!result.data?.revisionId)throw new HttpError(503,'storage_failed')
      for(const id of [input.previewUploadId,input.masterUploadId].filter(Boolean))
        await removeFiles(masters,[printStagingPath(print.artwork_id,admin,id)])
      if(result.data.preview!==previewUrl)await removeFiles(previews,[previewPath])
      return {saved:true,printId:print.id,revisionId:result.data.revisionId}
    } finally {
      if(!commitSent) {
        await removeFiles(previews,[previewPath])
        if(masterPath)await removeFiles(masters,[masterPath])
      }
    }
  })
}

