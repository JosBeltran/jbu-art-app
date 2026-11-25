'use client'

import {useEffect,useRef,useState} from 'react'
import {Button,Checkbox,FileUploaderDropContainer,InlineLoading,InlineNotification,Tile} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {authHeaders} from '@/lib/authHeaders'
import {supabase} from '@/lib/supabaseClient'
import {PRINT_SOURCE_TYPES} from '@/lib/printAssetPresets'
import {uploadPrintSource} from '@/lib/printSourceUpload'

async function requestMaster(printId,body) {
  const response=await fetch('/api/admin/prints/master'+(body ? '' : '?id='+encodeURIComponent(printId)),{
    method:body ? 'POST' : 'GET',cache:'no-store',
    headers:{...await authHeaders(),...(body ? {'Content-Type':'application/json'} : {})},
    body:body ? JSON.stringify({...body,printId}) : undefined,
  })
  const data=await response.json()
  if(!response.ok)throw new Error(data.error || 'storage_failed')
  return data
}

export default function ArtworkPrintMasterUpload({printId,onChange}) {
  const {t}=useI18n()
  const [data,setData]=useState(null),[file,setFile]=useState(null),[check,setCheck]=useState(null)
  const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [progress,setProgress]=useState(null)
  const staged=useRef(null),locked=useRef(false)
  useEffect(()=>{
    let alive=true
    requestMaster(printId).then(value=>{if(alive)setData(value)}).catch(err=>{if(alive)setError(err.message)})
    return ()=>{alive=false}
  },[printId])
  const messages={
    invalid_print_size:t('Guarda un tamaño normalizado en este Artwork Print antes de cargar el maestro.','Save a normalized size on this Artwork Print before uploading the master.'),
    source_too_large:t('El archivo supera el límite efectivo del proyecto o del bucket privado.','The file exceeds the effective project or private bucket limit.'),
    invalid_upload:t('Selecciona JPG, PNG, WebP o TIFF.','Choose JPG, PNG, WebP or TIFF.'),
    insufficient_resolution:t('El archivo no alcanza la resolución mínima para este tamaño.','The file does not meet the minimum resolution for this size.'),
    aspect_mismatch:t('El formato o la orientación no coincide con el tamaño del Artwork Print.','The format or orientation does not match the Artwork Print size.'),
    framing_mismatch:t('El archivo difiere de la vista previa aprobada. Revisa sus bordes y composición.','The file differs from the approved preview. Check its borders and composition.'),
    preview_changed:t('El archivo o la revisión cambió. Vuelve a validar.','The file or revision changed. Validate again.'),
    layout_changed:t('El Artwork Print cambió. Cierra y vuelve a abrir su edición.','The Artwork Print changed. Close and reopen its editor.'),
    upload_incomplete:t('La carga no terminó correctamente. Vuelve a intentar.','The upload did not complete correctly. Try again.'),
    master_already_exists:t('Este Artwork Print ya tiene maestro. Actualiza la ficha.','This Artwork Print already has a master. Refresh its details.'),
    master_busy:t('Hay otra preparación en curso. Vuelve a intentar después.','Another preparation is in progress. Try again later.'),
  }
  async function run(attach=false) {
    if(locked.current || !data || !file || attach && (!confirmed || !check))return
    locked.current=true;setBusy(true);setError('')
    try {
      if(!staged.current) {
        const uploadId=await uploadPrintSource({file,policy:data.uploadPolicy,storage:supabase.storage,
          projectUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,onProgress:setProgress,
          request:async body=>{
            const response=await fetch('/api/admin/artworks/'+data.print.artwork_id+'/print-assets',{
              method:'POST',headers:{...await authHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body),
            })
            const result=await response.json()
            if(!response.ok)throw new Error(result.error || 'storage_failed')
            return result
          }})
        staged.current=uploadId
      }
      const result=await requestMaster(printId,{action:attach ? 'attach' : 'inspect',uploadId:staged.current,type:file.type,
        revisionId:data.revisionId,key:check?.key,confirm:confirmed})
      if(attach) {
        setCheck(null);setFile(null);setConfirmed(false);staged.current=null
        setData(await requestMaster(printId))
        onChange?.()
      } else {setCheck(result);setConfirmed(false)}
    } catch(err) {
      setError(err.message)
      if(['source_unavailable','upload_incomplete'].includes(err.message))staged.current=null
    } finally {setBusy(false);setProgress(null);locked.current=false}
  }
  async function download() {
    try {
      const response=await fetch('/api/admin/print-production?variant='+encodeURIComponent(printId)+'&download',{headers:await authHeaders()})
      const result=await response.json()
      if(!response.ok)throw new Error(result.error)
      const link=document.createElement('a');link.href=result.url;link.rel='noreferrer';link.click()
    } catch(err) {setError(err.message)}
  }
  return <Tile className="mt-4 grid gap-3">
    <h3>{t('Archivo maestro de este Artwork Print','Master file for this Artwork Print')}</h3>
    <p>{t('El maestro se asocia a este mismo registro. Su ID y las referencias del discovery se conservan.','The master is attached to this same record. Its ID and discovery references are preserved.')}</p>
    {error && <InlineNotification kind="error" lowContrast title={messages[error] || t('No se pudo completar la operación. Vuelve a intentar.','The operation could not be completed. Try again.')} onClose={()=>setError('')} />}
    {!data && !error && <InlineLoading />}
    {data?.hasMaster ? <>
      <p>{t('Maestro disponible.','Master available.')}</p>
      <Button kind="secondary" size="sm" onClick={download}>{t('Descargar maestro','Download master')}</Button>
    </> : data && <>
      {!data.print.size_code && <p>{messages.invalid_print_size}</p>}
      <p>{t('Carga el archivo final al tamaño del papel, incluidos los bordes que deba llevar.','Upload the final file at the paper size, including any required borders.')}</p>
      <FileUploaderDropContainer name={'master-'+printId} accept={PRINT_SOURCE_TYPES} multiple={false} disabled={busy || !data.print.size_code}
        labelText={t('Selecciona un maestro de hasta','Choose a master up to')+' '+(data.uploadPolicy.maxBytes/1024/1024)+' MB'}
        onAddFiles={(_,value)=>{setFile(value.addedFiles?.[0] || null);setCheck(null);setConfirmed(false);staged.current=null}} />
      {file && <p>{file.name}</p>}
      <Button kind="secondary" size="sm" disabled={busy || !file || !data.print.size_code} onClick={()=>run()}>{t('Cargar y validar maestro','Upload and validate master')}</Button>
      {check && <>
        {/* eslint-disable-next-line @next/next/no-img-element -- Bounded authenticated thumbnail. */}
        <img src={check.image} alt={t('Maestro propuesto','Proposed master')} className="max-h-64 max-w-full object-contain" />
        <p>{check.width} × {check.height} px · {Math.round(check.dpi)} DPI</p>
        <Checkbox id={'confirm-master-'+printId} checked={confirmed} disabled={busy}
          labelText={t('Confirmo que este es el archivo final correcto para este Artwork Print.','I confirm this is the correct final file for this Artwork Print.')}
          onChange={(_,value)=>setConfirmed(value.checked)} />
        <Button size="sm" disabled={busy || !confirmed} onClick={()=>run(true)}>{t('Asociar maestro a este Artwork Print','Attach master to this Artwork Print')}</Button>
      </>}
    </>}
    {busy && <InlineLoading description={t('Procesando archivo…','Processing file…')} />}
    {progress!==null && <div role="status" aria-live="polite"><progress max="100" value={progress} aria-label={t('Carga del maestro','Master upload')} /> {progress}%</div>}
  </Tile>
}

