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
  const [visible,setVisible]=useState({source,print})
  if (visible.source===source && visible.print!==print) setVisible({source,print})
  const layers=visible.source===source ? [{source,print}] : [visible,{source,print,pending:true}]

  return <div ref={ref} className={styles.stage} style={{aspectRatio:scene.width/scene.height}}>
    <OptimizedImg src={scene.url} alt={scene.name} className={styles.background} sizes="(max-width: 700px) 100vw, 55vw" onFinalError={onImageError} />
    {size?.every(n=>n>0) && layers.map(layer=>
      <PrintLayer key={layer.source} {...layer} scene={scene} size={size} alt={alt}
        onReady={layer.pending ? ()=>setVisible({source,print}) : undefined}
        onImageError={layer.source===source ? onImageError : undefined} />)}
  </div>
}

function PrintLayer({scene,print,source,size,alt,pending,onReady,onImageError}) {
  const placement=roomPrintPlacement(scene,print)
  const appearance=mockupAppearance(print,print.borderMm,print.framed)
  const frameWidth=visualFrameWidth(print)
  const frameX=print.framed ? 100*frameWidth/(print.widthMm+2*frameWidth) : 0
  const frameY=print.framed ? 100*frameWidth/(print.heightMm+2*frameWidth) : 0
  const baseHeight=base*(print.heightMm+2*frameWidth)/(print.widthMm+2*frameWidth)
  if (!source || !placement?.fits || !appearance) return null

  async function reveal(event) {
    const image=event.currentTarget
    await image.decode?.().catch(()=>{})
    if (image.isConnected) onReady()
  }

  return <div className={`${styles.plane} ${pending ? styles.pending : styles.visible}`} aria-hidden={pending || undefined}
    style={{width:base,height:baseHeight,transform:roomPrintMatrix(placement.corners,...size,base,baseHeight),
      background:appearance.frameColor || 'white'}}>
    <div className={styles.paper} style={{inset:`${frameY}% ${frameX}%`}}>
      <div className={styles.art} style={{inset:`${appearance.insetY}% ${appearance.insetX}%`}}>
        <OptimizedImg src={source} alt={alt} sizes="(max-width: 700px) 40vw, 350px" onFinalError={onImageError}
          onLoad={onReady ? reveal : undefined}
          style={{width:'100%',height:'100%',objectFit:print.fit==='cover' ? 'cover' : 'contain'}} />
      </div>
    </div>
  </div>
}
