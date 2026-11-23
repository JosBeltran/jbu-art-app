'use client'

import {useRef,useLayoutEffect,useState} from 'react'
import OptimizedImg from '@/components/media/OptimizedImg'
import {mockupAppearance} from '@/lib/productCatalog/configuration'
import {roomPrintMatrix,roomPrintPlacement,visualFrameWidth} from '@/lib/productCatalog/roomScene'
import styles from './RoomScene.module.css'

const base=100

export default function RoomScene({scene,print,source,alt,onImageError}) {
  const ref=useRef(null)
  const [size,setSize]=useState(null)
  useLayoutEffect(()=>{
    const node=ref.current
    const observer=new ResizeObserver(([{contentRect}])=>setSize([contentRect.width,contentRect.height]))
    observer.observe(node)
    return ()=>observer.disconnect()
  },[])
  const placement=roomPrintPlacement(scene,print)
  const appearance=mockupAppearance(print,print.borderMm,print.framed)
  const frameWidth=visualFrameWidth(print)
  const frameX=print.framed ? 100*frameWidth/(print.widthMm+2*frameWidth) : 0
  const frameY=print.framed ? 100*frameWidth/(print.heightMm+2*frameWidth) : 0
  const baseHeight=base*(print.heightMm+2*frameWidth)/(print.widthMm+2*frameWidth)
  return <div ref={ref} className={styles.stage} style={{aspectRatio:scene.width/scene.height}}>
    <OptimizedImg src={scene.url} alt={scene.name} className={styles.background} sizes="(max-width: 700px) 100vw, 55vw" onFinalError={onImageError} />
    {source && placement?.fits && appearance && size?.every(n=>n>0) &&
      <div className={styles.plane} style={{width:base,height:baseHeight,transform:roomPrintMatrix(placement.corners,...size,base,baseHeight),
        background:appearance.frameColor || 'white'}}>
        <div className={styles.paper} style={{inset:`${frameY}% ${frameX}%`}}>
          <div className={styles.art} style={{inset:`${appearance.insetY}% ${appearance.insetX}%`}}>
            <OptimizedImg src={source} alt={alt} sizes="(max-width: 700px) 40vw, 350px" onFinalError={onImageError}
              style={{width:'100%',height:'100%',objectFit:print.fit==='cover' ? 'cover' : 'contain'}} />
          </div>
        </div>
      </div>}
  </div>
}
