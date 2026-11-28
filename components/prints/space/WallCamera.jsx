'use client'
import {useEffect,useRef,useState} from 'react'
import {Button,InlineNotification} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'

export default function WallCamera({onPhoto,onClose}) {
  const {t}=useI18n()
  const video=useRef(null)
  const [status,setStatus]=useState('loading')
  useEffect(()=>{
    let stopped=false,stream
    async function open() {
      try {
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1600}},audio:false})
        if(stopped) {stream.getTracks().forEach(track=>track.stop());return}
        video.current.srcObject=stream
        await video.current.play()
        if(!stopped)setStatus('ready')
      } catch {
        stream?.getTracks().forEach(track=>track.stop())
        if(!stopped)setStatus('error')
      }
    }
    void open()
    return ()=>{stopped=true;stream?.getTracks().forEach(track=>track.stop())}
  },[])
  function take() {
    const source=video.current
    if(!source?.videoWidth)return
    const canvas=document.createElement('canvas')
    const scale=Math.min(1,1800/Math.max(source.videoWidth,source.videoHeight))
    canvas.width=Math.round(source.videoWidth*scale);canvas.height=Math.round(source.videoHeight*scale)
    const context=canvas.getContext('2d')
    if(!context) {setStatus('error');return}
    context.drawImage(source,0,0,canvas.width,canvas.height)
    canvas.toBlob(blob=>{
      if(blob) onPhoto({blob,width:canvas.width,height:canvas.height})
      else setStatus('error')
    },'image/jpeg',.84)
  }
  return <>
    {status==='error' ? <InlineNotification lowContrast kind="warning" hideCloseButton
      title={t('No pudimos abrir la cámara','We could not open the camera')}
      subtitle={t('Puedes subir una foto o elegir un ambiente.','You can upload a photo or select a room.')} /> :
      <video ref={video} muted playsInline autoPlay style={{width:'100%',maxHeight:'40vh'}} />}
    <Button kind="tertiary" size="sm" disabled={status!=='ready'} onClick={take}>{t('Tomar foto','Take photo')}</Button>
    <Button kind="ghost" size="sm" onClick={onClose}>{t('Cerrar cámara','Close camera')}</Button>
  </>
}
