import {test} from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {printBorderMm,expandPrintPresentations,duplicatePrintPresentations} from '../lib/printPresentation.js'
import {matrixConfigurationId} from '../lib/productCatalog/dynamicMatrix.js'
import {printAssetGeometry,printLayoutOptions,printLayoutPolicy} from '../lib/printAssetLayout.js'
import {assessPreparedFiles} from '../lib/preparedPrintFiles.server.js'
import {renderPrintMaster} from '../lib/printAssetRender.server.js'

const variant={externalId:'paper',externalVariantId:'A2-framed',widthMm:420,heightMm:594,configuration:{frame:'black'},attributes:{orientation:'portrait'}}
const prints=[5,10].map(value=>({id:'print-'+value,artwork_id:'art',size_code:'A2',is_active:true,orientation:'portrait',border_unit:'percent',border_value:value,preview_is_prepared:true,image_url:'preview-'+value}))
test('each compatible border gets a separate identity and mock source without changing provider configuration',()=>{
  const rows=expandPrintPresentations(variant,prints)
  assert.equal(rows.length,2)
  assert.notEqual(matrixConfigurationId(rows[0]),matrixConfigurationId(rows[1]))
  assert.deepEqual(rows.map(row=>row.presentationPreview),['preview-5','preview-10'])
  assert.deepEqual(rows.map(row=>row.presentationBorderMm),[21,42])
  assert.ok(rows.every(row=>row.configuration===variant.configuration))
  assert.equal(expandPrintPresentations({...variant,widthMm:594,heightMm:420,attributes:{orientation:'landscape'}},prints).length,0)
  assert.equal(expandPrintPresentations(variant,[{...prints[0],orientation:null}]).length,0)
  assert.deepEqual(duplicatePrintPresentations([...prints,{...prints[0],id:'copy'}]),[['print-5','copy']])
  assert.equal(duplicatePrintPresentations([prints[0],{...prints[0],id:'different-art',artwork_id:'other'}]).length,0)
})
test('preset reserves percent of short edge per side, permits Lanczos enlargement and A0 at 300 DPI',()=>{
  const policy=printLayoutPolicy({})
  const options=printLayoutOptions({mode:'preset',border_unit:'percent',border_value:10},policy)
  const geometry=printAssetGeometry('30X40CM',options,{width:2835,height:4016},policy)
  assert.deepEqual([geometry.width,geometry.height],[3543,4724])
  assert.ok(Math.abs(geometry.artworkWidth-2835)<=1)
  assert.ok(Math.abs(geometry.artworkHeight-4016)<=1)
  assert.equal(printBorderMm({border_unit:'percent',border_value:5},'50X70CM'),25)
  const a0=printAssetGeometry('A0',options,{width:1000,height:1400},policy)
  assert.deepEqual([a0.width,a0.height],[9933,14043])
  assert.equal(a0.interpolates,true)
  assert.throws(()=>printBorderMm({border_unit:'percent',border_value:50},'A2'))
})
test('prepared files preserve the final paper, validate appearance and border, and allow preview-only',async()=>{
  const image=await sharp({create:{width:640,height:900,channels:3,background:'#4c2184'}}).png().toBuffer()
  const policy=printLayoutPolicy({}),geometry=printAssetGeometry('A4',printLayoutOptions({mode:'preset',border_unit:'percent',border_value:5},policy),{width:640,height:900},policy)
  const master=await renderPrintMaster(image,geometry)
  const preview=await sharp(master).resize({height:800}).webp().toBuffer()
  const print={size_code:'A4',orientation:'portrait',border_unit:'percent',border_value:5}
  const result=await assessPreparedFiles(print,preview,master)
  assert.ok(result.dpi>299)
  assert.equal(result.layout.preparedFile,true)
  assert.equal((await assessPreparedFiles(print,preview,null)).dpi,null)
  const different=await sharp(master).negate().webp().toBuffer()
  await assert.rejects(assessPreparedFiles(print,different,master),{code:'framing_mismatch'})
  await assert.rejects(assessPreparedFiles({...print,orientation:'landscape'},preview,master),{code:'aspect_mismatch'})
  await assert.rejects(assessPreparedFiles({...print,border_value:20},preview,master),{code:'border_mismatch'})
})
