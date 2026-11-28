import {useRef,useState} from 'react'
import {useI18n} from '@/components/I18nProvider'
import {adjustPhotoRectangle} from '@/lib/productCatalog/wallSpace'
import styles from './WallSpace.module.css'

export default function PhotoCalibration({rectangle,onChange}) {
  const {t}=useI18n()
  const drag=useRef(null)
  const [adjusting,setAdjusting]=useState(false)
  const [left,top,right,bottom]=rectangle
  const position={left:left*100+'%',top:top*100+'%',width:(right-left)*100+'%',height:(bottom-top)*100+'%'}
  const corners=[[left,top],[right,top],[right,bottom],[left,bottom]]
  const labels=[t('superior izquierda','top left'),t('superior derecha','top right'),
    t('inferior derecha','bottom right'),t('inferior izquierda','bottom left')]

  function handleOf(event) {
    const value=event.currentTarget.dataset.corner
    return value==null ? null : Number(value)
  }

  function onPointerDown(event) {
    if(event.button!==0 || drag.current)return
    const stage=event.currentTarget.parentElement.getBoundingClientRect()
    drag.current={rectangle,x:event.clientX,y:event.clientY,width:stage.width,height:stage.height}
    event.currentTarget.setPointerCapture(event.pointerId)
    setAdjusting(true)
  }

  function onPointerMove(event) {
    if(!event.currentTarget.hasPointerCapture(event.pointerId) || !drag.current)return
    const start=drag.current
    onChange(adjustPhotoRectangle(start.rectangle,handleOf(event),
      (event.clientX-start.x)/start.width,(event.clientY-start.y)/start.height))
  }

  function onLostPointerCapture() {
    drag.current=null
    setAdjusting(false)
  }

  function onKeyDown(event) {
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key]
    if(!delta)return
    event.preventDefault()
    setAdjusting(true)
    onChange(adjustPhotoRectangle(rectangle,handleOf(event),delta[0]*.01,delta[1]*.01))
  }

  function endKeyboardAdjustment() {
    if(!drag.current)setAdjusting(false)
  }

  const controls={onPointerDown,onPointerMove,onLostPointerCapture,onKeyDown,
    onKeyUp:endKeyboardAdjustment,onBlur:endKeyboardAdjustment}
  return <>
    <button type="button" className={styles.calibrationMove} style={position}
      aria-label={t('Mover área de calibración','Move calibration area')} {...controls} />
    {adjusting && <span className={styles.calibrationOutline} aria-hidden style={position} />}
    {corners.map(([x,y],index)=><button key={index} type="button" data-corner={index} className={styles.calibrationCorner}
      style={{left:x*100+'%',top:y*100+'%'}} aria-label={t('Ajustar esquina','Resize corner')+' '+labels[index]}
      {...controls} />)}
  </>
}
