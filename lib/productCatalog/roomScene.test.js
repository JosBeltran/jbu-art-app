import test from 'node:test'
import assert from 'node:assert/strict'
import {initialRoomPlacement,matchingRoomScenes,roomPlacement,roomPrintMatrix,roomPrintPlacement,wallCoordinates,wallPoint,wallTransform} from './roomScene.js'

const frontal={width:2000,height:1000,placement:{...initialRoomPlacement,corners:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],widthCm:160}}
const print=(widthMm,heightMm,more={})=>({widthMm,heightMm,...more})
const delta=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`)

test('A3, A2 and A1 use physical media dimensions against the same wall',()=>{
  for (const [w,h] of [[297,420],[420,594],[594,841]]) {
    const result=roomPrintPlacement(frontal,print(w,h))
    assert.ok(result.fits=== (h<=800))
    if (!result.fits) continue
    assert.ok(result.calibrated)
    delta(result.corners[1][0]-result.corners[0][0],w/2000)
    delta(result.corners[3][1]-result.corners[0][1],h/1000)
  }
  const taller={...frontal,placement:{...frontal.placement,heightCm:100}}
  const a1=roomPrintPlacement(taller,print(594,841))
  assert.ok(a1.fits)
  delta(a1.corners[3][1]-a1.corners[0][1],.8*841/1000)
})

test('perspective reproduces all four corners and round-trips the visual center',()=>{
  const corners=[[.2,.2],[.8,.1],[.81,.83],[.21,.66]]
  const map=wallTransform(corners)
  for (const [i,[x,y]] of [[0,0],[1,0],[1,1],[0,1]].entries()) {
    wallPoint(map,x,y).forEach((v,axis)=>delta(v,corners[i][axis]))
    wallCoordinates(map,corners[i]).forEach((v,axis)=>delta(v,[x,y][axis]))
  }
  const css=roomPrintMatrix(corners,800,400,100,150).slice(9,-1).split(',').map(Number)
  for (const [i,[x,y]] of [[0,0],[100,0],[100,150],[0,150]].entries()) {
    const w=css[3]*x+css[7]*y+css[15]
    delta((css[0]*x+css[4]*y+css[12])/w,corners[i][0]*800)
    delta((css[1]*x+css[5]*y+css[13])/w,corners[i][1]*400)
  }
  const perspective={...frontal,placement:{...frontal.placement,corners}}
  assert.equal(roomPrintPlacement(perspective,print(297,420)).calibrated,false)
  perspective.placement.heightCm=150
  assert.equal(roomPrintPlacement(perspective,print(297,420)).calibrated,true)
  assert.equal(roomPlacement({...perspective.placement,corners:[corners[0],corners[2],corners[1],corners[3]]}),null)
})

test('oversized prints are rejected and unverified frames are labelled illustrative',()=>{
  assert.deepEqual(roomPrintPlacement(frontal,print(1200,900)),{fits:false})
  assert.equal(roomPrintPlacement(frontal,print(297,420,{framed:true})).outerVerified,false)
  assert.equal(roomPrintPlacement(frontal,print(297,420,{framed:true,frameWidthMm:10})).outerVerified,true)
  assert.equal(roomPrintPlacement({...frontal,placement:{...frontal.placement,widthCm:null}},print(297,420)).calibrated,false)
})

test('uses product, exact artwork, family and global precedence and keeps compatible scenes',()=>{
  const scenes=[
    {id:'global',targets:[{}]},
    {id:'family',targets:[{family_code:'framed_print'}],family:'framed_print'},
    {id:'art',targets:[{artwork_id:'version-a'}]},
    {id:'other-version',targets:[{artwork_id:'version-b'}]},
    {id:'product',targets:[{product_id:'product-a'}]},
  ]
  const original={artworkId:'version-a',productId:'product-a',productFamily:'framed_print'}
  assert.deepEqual(matchingRoomScenes(scenes,original).map(row=>row.id),['product','art','family','global'])
  const other={...original,productId:'product-b',productFamily:'fine_art_print'}
  assert.deepEqual(matchingRoomScenes(scenes,other,'product').map(row=>row.id),['product','art','global'])
  assert.deepEqual(matchingRoomScenes(scenes,other,'family').map(row=>row.id),['art','global'])
})
