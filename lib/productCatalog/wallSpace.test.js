import test from 'node:test'
import assert from 'node:assert/strict'
import {bundleWallPrints,calibratedWall,compositionRoomScenes,originalWallGeometry,photoWallPlacement,placeWallItem,wallInsertionPosition,wallItemDimensions} from './wallSpace.js'

const wall={width:1600,height:1000,placement:{corners:[[0,0],[1,0],[1,1],[0,1]],center:[.5,.5],widthCm:220,heightCm:170}}

test('monumental originals use published cm dimensions and report narrow walls',()=>{
  const piece=originalWallGeometry('185 × 125 × 4 cm')
  assert.deepEqual(wallItemDimensions(piece),[185,125])
  assert.equal(placeWallItem(wall,piece,[.5,.5]).projection.calibrated,true)
  assert.equal(placeWallItem({...wall,placement:{...wall.placement,widthCm:140}},piece,[.5,.5]).reason,'tooWide')
  assert.equal(placeWallItem(wall,piece,[.25,.5]).reason,'outside')
  assert.equal(originalWallGeometry('72 × 48 in'),null)
})

test('photos with perspective need both physical axes and a convex ordered wall',()=>{
  const perspective={...wall,placement:{...wall.placement,corners:[[.1,.1],[.8,.2],[.9,.9],[.1,.8]],heightCm:null}}
  assert.equal(calibratedWall(perspective),null)
  assert.ok(calibratedWall({...perspective,placement:{...perspective.placement,heightCm:170}}))
  assert.equal(calibratedWall({...wall,placement:{...wall.placement,corners:[[0,0],[1,1],[1,0],[0,1]]}}),null)
})

test('physical frame width affects fit and independently positioned copies keep their exact cart variant',()=>{
  const print={widthMm:410,heightMm:594,framed:true,frameWidthMm:20}
  assert.deepEqual(wallItemDimensions(print),[45,63.4])
  const left=placeWallItem(wall,print,[.25,.5]),right=placeWallItem(wall,print,[.75,.5])
  assert.ok(left.projection.corners[0][0]<right.projection.corners[0][0])
  const variant={id:'black-a2',artworkId:'print'}
  const other={id:'wood-a1',artworkId:'print'}
  assert.deepEqual(bundleWallPrints([{variant},{artworkId:'original'},{variant:other},{variant}]),
    [{id:'print',variantId:'black-a2',quantity:2},{id:'print',variantId:'wood-a1',quantity:1}])
})


test('photo corners can be marked left-to-right on both rows without losing the artwork',()=>{
  const points=[[.15,.12],[.83,.11],[.16,.62],[.85,.65]]
  const placement=photoWallPlacement(points,200,85)
  assert.deepEqual(placement.corners,[points[0],points[1],points[3],points[2]])
  assert.ok(placeWallItem({...wall,placement},originalWallGeometry('40 × 60 cm'),placement.center).projection)
  assert.equal(photoWallPlacement([points[0],points[0],points[2],points[3]],200,85),null)
})

test('new frames align with the active center and keep an 8 cm gap between outer edges',()=>{
  const geometry={widthMm:400,heightMm:600,framed:true,frameWidthMm:20}
  const existing=[{instanceId:'other',geometry,center:[.23,.25]},{instanceId:'active',geometry,center:[.5,.65]}]
  const [x,y]=wallInsertionPosition(wall,existing,'active')(geometry)
  assert.equal(y,.65)
  assert.ok(Math.abs((x-.5)*220-44-8)<1e-7)
})

test('a piece near an edge goes on the other side or shifts to fit a measured wall',()=>{
  const geometry={widthMm:400,heightMm:600}
  const current={instanceId:'active',geometry,center:[.85,.22]}
  const left=wallInsertionPosition(wall,[current],'active')(geometry)
  assert.ok(left[0]<current.center[0])
  assert.equal(left[1],.22)
  const tall={widthMm:400,heightMm:1200}
  const shifted=wallInsertionPosition(wall,[current],'active')(tall)
  assert.ok(shifted[1]>.22)
  assert.ok(placeWallItem(wall,tall,shifted).projection)
})


test('an assigned decorative room ranks above calibrated artwork and generic rooms',()=>{
  const variant={artworkId:'art',productId:'print',productFamily:'poster'}
  const generic={...wall,id:'generic',targets:[{}]}
  const artwork={...wall,id:'artwork',targets:[{artwork_id:'art'}]}
  const assigned={...wall,id:'assigned',targets:[{product_id:'print'}],
    placement:{...wall.placement,widthCm:null,heightCm:null}}
  const unrelated={...wall,id:'unrelated',targets:[{product_id:'other'}]}
  const fallback={...wall,id:'fallback'}
  const rooms=compositionRoomScenes([generic,unrelated,artwork,assigned],[fallback,artwork],variant)
  assert.deepEqual(rooms.map(scene=>scene.id),['assigned','artwork','generic','fallback'])
  assert.equal(calibratedWall(rooms[0]),null)
})
