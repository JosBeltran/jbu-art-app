import {test} from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {inspectArtworkPrintMaster} from '../lib/artworkPrintMaster.server.js'
const print={id:'10000000-0000-4000-8000-000000000001',artwork_id:'20000000-0000-4000-8000-000000000001',size_code:'A3',paper_type:'Cotton'}
const config={supabaseUrl:'https://project.supabase.co'}
const image=async(width,height,color='#772277')=>sharp({create:{width,height,channels:3,background:color}}).png().toBuffer()
const inspect=(input,current=null,options={})=>inspectArtworkPrintMaster({},print,current,'admin','30000000-0000-4000-8000-000000000001',config,
  {read:async()=>({input}),...options})
test('validates a final paper-sized master and returns only a bounded thumbnail for review',async()=>{
  const result=await inspect(await image(1754,2480))
  assert.ok(result.dpi>149)
  assert.equal(result.size,'A3')
  assert.equal(result.layout.algorithmVersion,2)
  assert.ok(result.thumbnail.length<100000)
  assert.match(result.sha,/^[a-f0-9]{64}$/)
})
test('rejects wrong canvas proportions and low-resolution masters',async()=>{
  await assert.rejects(inspect(await image(1200,1200)),/aspect_mismatch/)
  await assert.rejects(inspect(await image(297,420)),/insufficient_resolution/)
})
test('pending approved previews require the same canvas orientation and composition',async()=>{
  const input=await image(1754,2480)
  const before=await inspect(input)
  const current={revision_id:'revision',layout:{...before.layout,algorithmVersion:1,outputDpi:150},
    preview_image_url:'https://project.supabase.co/storage/v1/object/public/artworks/preview.webp'}
  const result=await inspect(input,current,{fetchSource:async()=>new Response(before.thumbnail)})
  assert.ok(result.key)
  await assert.rejects(inspect(await image(1754,2480,'#00ff00'),current,{fetchSource:async()=>new Response(before.thumbnail)}),/framing_mismatch/)
  await assert.rejects(inspect(await image(2480,1754),current),/aspect_mismatch/)
})

