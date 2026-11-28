import test from 'node:test'
import assert from 'node:assert/strict'
import {bundleWallPrints,calibratedWall,originalWallGeometry,placeWallItem,wallItemDimensions} from './wallSpace.js'

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
