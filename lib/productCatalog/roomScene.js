import {variantOrientation} from './configuration.js'

export const initialRoomPlacement = {
  corners:[[.22,.12],[.78,.12],[.78,.71],[.22,.71]], center:[.5,.5],
  widthCm:null,heightCm:null,
}

const unit = value => Number.isFinite(value) && value >= 0 && value <= 1
const point = value => Array.isArray(value) && value.length === 2 && value.every(unit)
const cross = ([ax,ay],[bx,by],[cx,cy]) => (bx-ax)*(cy-by)-(by-ay)*(cx-bx)

// Unit rectangle to quadrilateral, in top-left, top-right, bottom-right, bottom-left order.
export function wallTransform([a,b,c,d]) {
  const dx=b[0]-c[0], dy=b[1]-c[1], ex=d[0]-c[0], ey=d[1]-c[1]
  const fx=a[0]-b[0]+c[0]-d[0], fy=a[1]-b[1]+c[1]-d[1]
  const det=dx*ey-ex*dy
  const g=(fx*ey-ex*fy)/det, h=(dx*fy-fx*dy)/det
  return [b[0]*(1+g)-a[0],d[0]*(1+h)-a[0],a[0],b[1]*(1+g)-a[1],d[1]*(1+h)-a[1],a[1],g,h]
}

export function roomPlacement(value) {
  const {corners,center,widthCm,heightCm} = value || {}
  const validLength = length => length === null || (Number.isFinite(length) && length>=10 && length<=5000)
  if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(point) || !point(center) ||
    !corners.every((p,i)=>cross(p,corners[(i+1)%4],corners[(i+2)%4])>.0001) ||
    !validLength(widthCm) || !validLength(heightCm) || (widthCm===null && heightCm!==null)) return null
  const transform=wallTransform(corners)
  const [, , , , , ,g,h]=transform
  if (!transform.every(Number.isFinite) || Math.min(1,1+g,1+h,1+g+h)<.05) return null
  return {corners,center,widthCm,heightCm}
}

export function wallPoint([a,b,c,d,e,f,g,h],x,y) {
  const w=g*x+h*y+1
  return [(a*x+b*y+c)/w,(d*x+e*y+f)/w]
}

export function visualFrameWidth(print) {
  if (!print.framed) return 0
  return print.frameWidthMm>0 ? print.frameWidthMm : /alumin|metal/i.test(print.attributes?.frame_material) ? 5 : 9
}

export function roomPrintPlacement(scene,print) {
  const placement=roomPlacement(scene.placement)
  if (!placement || variantOrientation(print).conflict || !(print.widthMm>0 && print.heightMm>0 && scene.width>0 && scene.height>0)) return null
  const {corners,center,widthCm,heightCm}=placement
  const [[left,top],[right,topRight],[bottomRight,bottom],[bottomLeft,bottomY]]=corners
  const frontal=top===topRight && bottom===bottomY && right===bottomRight && left===bottomLeft
  const ratio=(right-left)*scene.width/((bottom-top)*scene.height)
  const calibrated=Boolean(widthCm && (heightCm || frontal))
  const planeWidth=calibrated ? widthCm : 180
  const planeHeight=calibrated ? heightCm || widthCm/ratio : 180/(frontal ? ratio : 1.25)
  const frameMm=visualFrameWidth(print)
  // Studio dimensions measure the paper. Unverified frame widths are illustrative.
  const w=(print.widthMm+2*frameMm)/10/planeWidth, h=(print.heightMm+2*frameMm)/10/planeHeight
  const x=center[0]-w/2, y=center[1]-h/2
  if (x<0 || y<0 || x+w>1 || y+h>1) return {fits:false}
  const project=wallTransform(corners)
  return {fits:true, calibrated, outerVerified:!print.framed || print.frameWidthMm>0,
    corners:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([u,v])=>wallPoint(project,u,v))}
}

export function roomPrintMatrix(corners,width,height,baseWidth,baseHeight) {
  const [a,b,c,d,e,f,g,h]=wallTransform(corners)
  return `matrix3d(${[a*width/baseWidth,d*height/baseWidth,0,g/baseWidth,b*width/baseHeight,e*height/baseHeight,0,h/baseHeight,0,0,1,0,c*width,f*height,0,1].join(',')})`
}

const matches = (scene,variant) => !scene.family || scene.family===variant.productFamily

export function matchingRoomScenes(scenes,variant,currentId) {
  return scenes.filter(scene=>matches(scene,variant) &&
    (scene.id===currentId || scene.targets.some(target=>target.product_id===variant.productId ||
      target.artwork_id===variant.artworkId || target.family_code===variant.productFamily ||
      (!target.product_id && !target.artwork_id && !target.family_code))))
    .sort((a,b)=>rank(b,variant,currentId)-rank(a,variant,currentId) || a.id.localeCompare(b.id))
}

function rank(scene,variant,currentId) {
  if (scene.id===currentId) return 4
  if (scene.targets.some(target=>target.product_id===variant.productId)) return 3
  if (scene.targets.some(target=>target.artwork_id===variant.artworkId)) return 2
  if (scene.targets.some(target=>target.family_code===variant.productFamily)) return 1
  return 0
}

export function wallCoordinates([a,b,c,d,e,f,g,h],[x,y]) {
  const u=a-g*x, v=b-h*x, s=d-g*y, t=e-h*y, det=u*t-v*s
  return [((x-c)*t-v*(y-f))/det,(u*(y-f)-s*(x-c))/det]
}
