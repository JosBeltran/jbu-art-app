import {matchingRoomScenes,roomPlacement,roomPrintPlacement,visualFrameWidth} from './roomScene.js'
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

export function compositionRoomScenes(assigned, fallback, variant) {
  const ranked=matchingRoomScenes([...assigned,...fallback],variant)
  return ranked.filter((scene,index)=>ranked.findIndex(row=>row.id===scene.id)===index)
}

export function placeWallItem(scene,print,center) {
  const wall=calibratedWall(scene)
  if (!wall) return {reason:'uncalibrated'}
  const [widthCm]=wallItemDimensions(print)
  if (widthCm>wall.widthCm) return {reason:'tooWide'}
  const projection=roomPrintPlacement({...scene,placement:{...wall,center}},print)
  return projection?.fits ? {projection} : {reason:'outside'}
}

const wallItemGapCm=8

export function wallInsertionPosition(scene,items,activeId) {
  const wall=calibratedWall(scene)
  const anchor=wall?.center || [.5,.5]
  const reference=items.find(row=>row.instanceId===activeId) || items[0]
  if(!reference)return ()=>anchor

  const [x,y]=reference.center || anchor
  if(!wall)return ()=>[x<=.5 ? Math.min(.9,x+.2) : Math.max(.1,x-.2),y]

  const [topLeft,topRight,bottomRight]=wall.corners
  const heightCm=wall.heightCm || wall.widthCm*(bottomRight[1]-topLeft[1])*scene.height/
    ((topRight[0]-topLeft[0])*scene.width)
  const gapX=wallItemGapCm/wall.widthCm,gapY=wallItemGapCm/heightCm
  const extents=print=>{
    const [width,height]=wallItemDimensions(print)
    return [width/(2*wall.widthCm),height/(2*heightCm)]
  }
  const occupied=items.map(row=>({
    center:row.center || anchor,
    half:extents(row.geometry),
  }))

  return print=>{
    const [halfX,halfY]=extents(print)
    if(!(halfX>0 && halfY>0 && halfX<=.5 && halfY<=.5))return [.5,.5]

    // Leave room for rounding at an edge, including behind a perspective transform.
    const clampToWall=(value,half)=>{
      const inset=Math.min(.5,half+1e-9)
      return Math.min(1-inset,Math.max(inset,value))
    }
    const columns=[x,0,1],rows=[y,0,1]
    for(const {center:[u,v],half:[w,h]} of occupied) {
      columns.push(u+w+gapX+halfX,u-w-gapX-halfX)
      rows.push(v+h+gapY+halfY,v-h-gapY-halfY)
    }
    const ys=[...new Set(rows.map(v=>clampToWall(v,halfY)))]
    const xs=[...new Set(columns.map(u=>clampToWall(u,halfX)))]
    const candidates=ys.flatMap(v=>xs.map(u=>[u,v]))
    const rank=([u,v])=>[
      Math.abs(v-y)>1e-8 ? 1 : 0,
      Math.hypot((u-x)*wall.widthCm,(v-y)*heightCm),
      u<x ? 1 : 0,
    ]
    const ranked=candidates.map(center=>({center,score:rank(center)}))
      .sort((a,b)=>a.score[0]-b.score[0] || a.score[1]-b.score[1] || a.score[2]-b.score[2])
    const free=([u,v])=>occupied.every(({center:[px,py],half:[w,h]})=>
      Math.abs(u-px)+1e-8>=w+halfX+gapX || Math.abs(v-py)+1e-8>=h+halfY+gapY)
    const available=ranked.find(({center})=>free(center))
    if(available)return available.center

    // On a full wall, keep the new piece inside and minimize overlap.
    const overlap=([u,v])=>occupied.reduce((area,{center:[px,py],half:[w,h]})=>{
      const width=Math.min(u+halfX,px+w)-Math.max(u-halfX,px-w)
      const height=Math.min(v+halfY,py+h)-Math.max(v-halfY,py-h)
      return area+Math.max(0,width)*Math.max(0,height)
    },0)
    return ranked.map(({center})=>({center,area:overlap(center)}))
      .reduce((best,row)=>row.area<best.area ? row : best).center
  }
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
