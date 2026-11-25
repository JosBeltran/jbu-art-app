import {createHash} from 'node:crypto'
import sharp from 'sharp'
import {readPublicSource,readSource,printStagingPath} from './printAssetGeneration.server.js'
import {inspectPrintSource,PRINT_PREVIEW_PADDING,printPreviewPlacement} from './printAssetRender.server.js'
import {PRINT_SIZE_CATALOG,artworkPrintSize} from './artworkPrintSizes.js'
import {printBorder,printBorderMm,printOrientation} from './printPresentation.js'
import {PrintAssetError} from './printAssetLayout.js'

const options={limitInputPixels:160_000_000,failOn:'error'}
export async function preparedPaperPreview(bytes,current=null) {
  let input=sharp(bytes,options).autoOrient()
  if(current?.layout?.algorithmVersion===1 && current.layout.mode!=='preset') {
    const {paperWidth,paperHeight}=printPreviewPlacement(current.layout)
    const meta=await sharp(bytes,options).metadata()
    if(meta.width===paperWidth+2*PRINT_PREVIEW_PADDING && meta.height===paperHeight+2*PRINT_PREVIEW_PADDING)
      input=input.extract({left:PRINT_PREVIEW_PADDING,top:PRINT_PREVIEW_PADDING,width:paperWidth,height:paperHeight})
  }
  return input.resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true,kernel:sharp.kernel.lanczos3})
    .flatten({background:'#ffffff'}).withIccProfile('srgb',{attach:false}).webp({quality:95}).toBuffer()
}
export async function preparedMargins(bytes,paper) {
  const {data,info}=await sharp(bytes,options).autoOrient().resize({width:512,height:512,fit:'inside',withoutEnlargement:true})
    .flatten({background:'#ffffff'}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true})
  const white=(x,y)=>{const p=(y*info.width+x)*info.channels;return data[p]>=242 && data[p+1]>=242 && data[p+2]>=242}
  const blankRow=y=>{let n=0;for(let x=0;x<info.width;x++)if(white(x,y))n++;return n/info.width>=0.995}
  const blankCol=x=>{let n=0;for(let y=0;y<info.height;y++)if(white(x,y))n++;return n/info.height>=0.995}
  let top=0,bottom=0,left=0,right=0
  while(top<info.height/2 && blankRow(top))top++
  while(bottom<info.height/2 && blankRow(info.height-1-bottom))bottom++
  while(left<info.width/2 && blankCol(left))left++
  while(right<info.width/2 && blankCol(info.width-1-right))right++
  return {top:top/info.height*paper.height,bottom:bottom/info.height*paper.height,
    left:left/info.width*paper.width,right:right/info.width*paper.width}
}
async function samePaper(a,b) {
  const pixels=bytes=>sharp(bytes,options).resize(128,128,{fit:'fill'}).flatten({background:'#fff'}).toColourspace('srgb').removeAlpha().raw().toBuffer()
  const [x,y]=await Promise.all([pixels(a),pixels(b)])
  let delta=0,changed=0
  for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);delta+=d;if(d>32)changed++}
  return delta/x.length<=8 && changed/x.length<=0.08
}
export async function assessPreparedFiles(print,preview,master,current=null) {
  if(!preview && !master)throw new PrintAssetError('source_missing')
  const size=artworkPrintSize(print),preset=PRINT_SIZE_CATALOG[size]
  if(!preset)throw new PrintAssetError('invalid_print_size')
  const previewMeta=preview ? await inspectPrintSource(preview) : null
  const masterMeta=master ? await inspectPrintSource(master) : null
  const masterFormat=master ? (await sharp(master,options).metadata()).format : null
  const dimensions=masterMeta || previewMeta
  const orientation=printOrientation(dimensions.width,dimensions.height)
  if(print.orientation && print.orientation!==orientation)throw new PrintAssetError('aspect_mismatch',422)
  const [paperWidthMm,paperHeightMm]=orientation==='landscape' ? [...preset.mm].reverse() : preset.mm
  for(const meta of [previewMeta,masterMeta].filter(Boolean)) {
    if(printOrientation(meta.width,meta.height)!==orientation || Math.abs((meta.width/meta.height)/(paperWidthMm/paperHeightMm)-1)>0.005)
      throw new PrintAssetError('aspect_mismatch',422)
  }
  const dpi=masterMeta ? 25.4*Math.min(masterMeta.width/paperWidthMm,masterMeta.height/paperHeightMm) : null
  if(dpi!=null && dpi+0.5<150)throw new PrintAssetError('insufficient_resolution',422)
  const publicPreview=await preparedPaperPreview(preview || master)
  const masterPreview=master ? await preparedPaperPreview(master) : null
  if(preview && master && !await samePaper(publicPreview,masterPreview))throw new PrintAssetError('framing_mismatch',422)
  const margins=await preparedMargins(master || preview,{width:paperWidthMm,height:paperHeightMm})
  const expected=printBorderMm(print,size)
  const tolerance=Math.max(paperWidthMm,paperHeightMm)/512*2
  if(expected>0 && Math.min(...Object.values(margins))+tolerance<expected)throw new PrintAssetError('border_mismatch',422)
  const width=masterMeta?.width || Math.round(paperWidthMm/25.4*300)
  const height=masterMeta?.height || Math.round(paperHeightMm/25.4*300)
  const layout={algorithmVersion:3,preparedFile:true,sourcePreviewOnly:!master,fileFormat:masterFormat,size,mode:'uploaded',
    width,height,left:0,top:0,artworkWidth:width,artworkHeight:height,sourceWidth:width,sourceHeight:height,
    sourceAspectRatio:width/height,paperWidthMm,paperHeightMm,artworkWidthMm:paperWidthMm,artworkHeightMm:paperHeightMm,
    outputDpi:masterMeta ? Math.round(dpi) : 300,effectiveDpi:dpi,minimumEffectiveDpi:150,
    fitStrategy:'contain',crop:null,colorProfile:'sRGB',marginsMm:margins,borderSpec:printBorder(print),
    borderValidation:'estimated-white-edges',paperType:print.paper_type || null,orientation}
  return {layout,dpi,orientation,previewMeta,masterMeta,publicPreview,
    previewSha:preview ? createHash('sha256').update(preview).digest('hex') : null,
    masterSha:master ? createHash('sha256').update(master).digest('hex') : null}
}
export async function loadPreparedFiles(db,print,current,admin,input,config) {
  const get=async id=>(await readSource(db,{id:print.artwork_id},{source:'upload'},
    printStagingPath(print.artwork_id,admin,id),config,fetch)).input
  let preview=input.previewUploadId ? await get(input.previewUploadId) : null
  const master=input.masterUploadId ? await get(input.masterUploadId) : null
  if(!preview && current?.preview_image_url) {
    const raw=await readPublicSource(current.preview_image_url,config,fetch)
    preview=await preparedPaperPreview(raw,current)
  } else if(!preview && print.preview_is_prepared && print.image_url)
    preview=await readPublicSource(print.image_url,config,fetch)
  const plan=await assessPreparedFiles(print,preview,master,current)
  plan.key=createHash('sha256').update(JSON.stringify([print.id,print.size_code,print.orientation,
    printBorder(print),current?.revision_id || null,plan.previewSha,plan.masterSha,input.previewUploadId || null,input.masterUploadId || null])).digest('hex')
  return plan
}

