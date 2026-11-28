import {roomPlacement,roomPrintPlacement,visualFrameWidth} from './roomScene.js'
import {parseCmDimensions} from '../dimensions.js'

export const maxWallItems=12

export function originalWallGeometry(dimensions) {
  const sizes=parseCmDimensions(dimensions)
  return sizes ? {widthMm:sizes[0]*10,heightMm:sizes[1]*10,framed:false} : null
}

export function wallItemDimensions(print) {
  const frame=visualFrameWidth(print)*2
  return [(print.widthMm+frame)/10,(print.heightMm+frame)/10]
}

export function photoWallPlacement(points,widthCm,heightCm) {
  if (points.length!==4) return null
  const center=points.reduce(([x,y],[u,v])=>[x+u/4,y+v/4],[0,0])
  const angle=([x,y])=>Math.atan2(y-center[1],x-center[0])
  const sorted=[...points].sort((a,b)=>angle(a)-angle(b))
  const start=sorted.reduce((best,point,index)=>
    point[0]+point[1]<sorted[best][0]+sorted[best][1] ? index : best,0)
  const corners=[...sorted.slice(start),...sorted.slice(0,start)]
  return roomPlacement({corners,center:[.5,.5],widthCm,heightCm})
}

export function calibratedWall(scene) {
  const plane=roomPlacement(scene?.placement)
  if (!plane?.widthCm) return null
  const [a,b,c,d]=plane.corners
  const frontal=a[1]===b[1] && c[1]===d[1] && a[0]===d[0] && b[0]===c[0]
  return plane.heightCm || (frontal && scene.width>0 && scene.height>0) ? plane : null
}

export function placeWallItem(scene,print,center) {
  const wall=calibratedWall(scene)
  if (!wall) return {reason:'uncalibrated'}
  const [widthCm]=wallItemDimensions(print)
  if (widthCm>wall.widthCm) return {reason:'tooWide'}
  const projection=roomPrintPlacement({...scene,placement:{...wall,center}},print)
  return projection?.fits ? {projection} : {reason:'outside'}
}

export function bundleWallPrints(items) {
  const counts=new Map()
  for(const row of items) {
    if(!row.variant) continue
    const line=counts.get(row.variant.id)
    counts.set(row.variant.id,{id:row.variant.artworkId,variantId:row.variant.id,quantity:(line?.quantity || 0)+1})
  }
  return [...counts.values()]
}
