import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'

const hook=registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only')return {url:'data:text/javascript,export%20%7B%7D',shortCircuit:true}
  return next(specifier,context)
}})
const {loadPrintRoomScenes}=await import('./roomScene.server.js')
const {roomPrintPlacement,matchingRoomScenes}=await import('./roomScene.js')
hook.deregister()

const artwork='exact-version',primary='https://example.test/artwork.jpg'
const variants=[
  {id:'border-5',productId:'product',artworkId:artwork,productFamily:'framed_print',previewGeometry:{widthMm:420,heightMm:594}},
  {id:'border-10',productId:'product',artworkId:artwork,productFamily:'framed_print',previewGeometry:{widthMm:594,heightMm:841}},
]
const scene={id:'room',name:'Room',width:2000,height:1000,object_path:'print-room-scenes/room.webp',revision:1,
  placement:{corners:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],center:[.5,.5],widthCm:160,heightCm:null}}
function fixture({sources=[],error=null,empty=false,fallback=[]}={}){
  const calls=[]
  const db={storage:{from(){return {getPublicUrl:path=>({data:{publicUrl:'https://example.test/'+path}})}}},
    from(table){
      if(table==='print_room_scene_targets')return {select(){return this},eq(field,value){assert.equal(field,'print_room_scenes.active');assert.equal(value,true);return this},
        or:async selectors=>{assert.ok(selectors.includes('artwork_id.eq.'+artwork));return {data:empty?[]:[{artwork_id:artwork,print_room_scenes:scene}]}}}
      assert.equal(table,'wall_art_mockups');calls.push('fallback')
      return {select(){return this},in(field,ids){assert.equal(field,'variant_id');this.ids=ids;return this},eq:async function(field,value){assert.equal(field,'source_url');assert.equal(value,primary);return {data:fallback.filter(row=>this.ids.includes(row.variant_id))}}}
    },
    rpc(name,args){calls.push(name);assert.equal(name,'fine_art_studio_default_mockups');assert.deepEqual(args._variants,variants.map(row=>row.id));
      return {select:async columns=>{assert.equal(columns,'variant_id,source_url');return {data:sources,error}}}},
  }
  return {db,calls}
}

test('room scenes use each exact automatic preview without masters and retain physical fit checks',async()=>{
  const sources=variants.map(row=>({variant_id:row.id,source_url:'https://example.test/prepared-'+row.id+'.webp'}))
  const {db,calls}=fixture({sources})
  const result=await loadPrintRoomScenes(db,artwork,variants,primary)
  assert.deepEqual(result.sources,Object.fromEntries(sources.map(row=>[row.variant_id,row.source_url])))
  assert.deepEqual(calls,['fine_art_studio_default_mockups'])
  assert.equal(matchingRoomScenes(result.scenes,variants[0])[0].id,'room')
  assert.equal(roomPrintPlacement(result.scenes[0],{...variants[0].previewGeometry,framed:true}).fits,true)
  assert.equal(roomPrintPlacement(result.scenes[0],{...variants[1].previewGeometry,framed:true}).fits,false)
})

test('missing RPC keeps only the exact-primary fallback, never another prepared preview',async()=>{
  const {db}=fixture({error:{code:'PGRST202'},fallback:[{variant_id:variants[0].id}]})
  const result=await loadPrintRoomScenes(db,artwork,variants,primary)
  assert.deepEqual(result.sources,{[variants[0].id]:primary})
})

test('unexpected source errors propagate instead of substituting an unrelated image',async()=>{
  const error={code:'42501'};const {db}=fixture({error})
  await assert.rejects(loadPrintRoomScenes(db,artwork,variants,primary),e=>e===error)
})

test('no active assigned scene skips source resolution',async()=>{
  const {db,calls}=fixture({empty:true})
  assert.deepEqual(await loadPrintRoomScenes(db,artwork,variants,primary),{scenes:[],sources:{}})
  assert.deepEqual(calls,[])
})
