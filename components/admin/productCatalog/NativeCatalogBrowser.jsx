'use client'
import {useEffect,useRef,useState} from 'react'
import {Button,Select,SelectItem,SkeletonText,TextInput,Tag} from '@carbon/react'
import {Image as ImageIcon} from '@carbon/icons-react'
import {useI18n} from '@/components/I18nProvider'
import {readStudioMatrix,newMatrixCheckpoint,sourcePageNext,retryDelay} from '@/lib/productCatalog/dynamicMatrix'
import {callCatalog} from './useCatalog'
import common from './ProductCatalog.module.css'
import styles from './SupplierCatalogBrowser.module.css'

export default function NativeCatalogBrowser({active,providers,initialProvider,country,busy,onConfigure}) {
  const {t,lang}=useI18n()
  const [provider,setProvider]=useState(providers.includes(initialProvider)?initialProvider:providers[0])
  const [category,setCategory]=useState('')
  const [query,setQuery]=useState('')
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState(null)
  const [retry,setRetry]=useState(0)
  const [clock,setClock]=useState(0)
  const [progress,setProgress]=useState({pages:0,done:0,total:0})
  const scope=useRef(null)
  const refreshRequest=useRef(null)
  const key=JSON.stringify([provider,category,country])
  useEffect(()=>{
    if(!active)return
    const abort=new AbortController()
    const timer=setTimeout(async()=>{
      setLoading(true);setError(null)
      const refresh=refreshRequest.current===key
      refreshRequest.current=null
      if(refresh || scope.current?.key!==key)scope.current={key,offset:0,metadataDone:false,categories:new Map(),definitions:new Map(),checkpoints:new Map(),cards:new Map(),metadataRepeats:0}
      const state=scope.current
      try {
        let metadataPages=0
        while(!state.metadataDone) {
          const data=await callCatalog('nativeDiscover',{provider,category:category || undefined,country,offset:state.offset,complete:true,refresh},{signal:abort.signal})
          for(const item of data.categories || [])state.categories.set(item.id,item)
          for(const item of data.presentationCandidates || [])state.definitions.set(item.id,item)
          const signature=data.discoveryPage?.sourceIds && JSON.stringify([...data.discoveryPage.sourceIds].sort())
          state.metadataRepeats=signature && signature===state.metadataSignature && data.discoveryPage.sourceCount>0 ? state.metadataRepeats+1 : 0
          state.metadataSignature=signature
          if(state.metadataRepeats>=2)throw Object.assign(new Error('matrix_pagination_stalled'),{code:'matrix_pagination_stalled'})
          const next=data.discoveryPage ? sourcePageNext(data.discoveryPage) : {done:data.nextOffset==null,next:data.nextOffset}
          if(next.done)state.metadataDone=true
          else if(!Number.isSafeInteger(next.next) || next.next<=state.offset)throw Object.assign(new Error('matrix_pagination_stalled'),{code:'matrix_pagination_stalled'})
          else state.offset=next.next
          if(abort.signal.aborted)return
          setProgress({pages:++metadataPages,done:0,total:state.definitions.size})
        }
        const presentations=[]
        let done=0
        for(const item of state.definitions.values()) {
          const input={provider:item.provider,catalogId:item.catalogId,presentationId:item.presentationId,country}
          const checkpoint=state.checkpoints.get(item.id)
          let collection
          try {
            const snapshot=await readStudioMatrix({input,refresh,
              loadSnapshot:(input,options)=>callCatalog('nativeMatrixSnapshot',input,options),
              loadPage:(input,options)=>callCatalog('nativeMatrixPage',input,options),
              checkpoint:checkpoint && !checkpoint.complete ? checkpoint : newMatrixCheckpoint(),signal:abort.signal,
              onProgress:value=>{state.checkpoints.set(item.id,value);if(!abort.signal.aborted)setProgress({pages:value.pages,done,total:state.definitions.size})}})
            collection=snapshot.value
            if(snapshot.source?.stale) state.saved=true
          } catch(err){if(err.checkpoint)state.checkpoints.set(item.id,err.checkpoint);throw err}
          if(collection.candidates.length){const card={...item,sizeSummary:[...new Set(collection.candidates.map(row=>row.attributes.size).filter(Boolean))],evidence:{scope:'complete_configuration_query',verifiedCandidates:collection.candidates.length}};presentations.push(card);state.cards.set(item.id,card)}
          if(abort.signal.aborted)return
          setProgress({pages:collection.pages,done:++done,total:state.definitions.size})
        }
        if(!abort.signal.aborted)setResult({key,provider,category,categories:[...state.categories.values()],presentations,complete:true,saved:state.saved})
      } catch(err) {
        if(abort.signal.aborted)return
        setError(err);setClock(Date.now())
        if(!err.retryAt)err.retryAt=Date.now()+retryDelay(err)
        setResult(previous=>previous?.key===key && previous.complete ? previous : {key,provider,category,categories:[...state.categories.values()],presentations:[...state.cards.values()],complete:false})
      } finally {if(!abort.signal.aborted)setLoading(false)}
    },0)
    return ()=>{clearTimeout(timer);abort.abort()}
  },[active,provider,category,country,key,retry])
  useEffect(()=>{
    if(!error?.retryAt)return
    const timer=setInterval(()=>setClock(Date.now()),1000)
    return ()=>clearInterval(timer)
  },[error])
  const current=result?.key===key
  const hasResults=current && result.complete
  function refreshCatalog() {
    refreshRequest.current=key
    setRetry(value=>value+1)
  }
  const items=current ? result.presentations.filter(item=>item.titles.join(' ').toLowerCase().includes(query.toLowerCase())) : []
  const wait=Math.max(0,Math.ceil(((error?.retryAt || 0)-clock)/1000))
  if(!active)return null
  return <section className={common.section}>
    <h2>{t('Proveedor, categoría y presentación','Supplier, category and presentation')}</h2>
    <p>{t('Elige una categoría. Cada presentación se habilita después de verificar todas sus páginas de configuración.','Choose a category. Each presentation becomes selectable after all of its configuration pages are verified.')}</p>
    <div className={styles.filters}>
      <Select id="native-provider" labelText={t('Proveedor','Supplier')} value={provider} onChange={event=>{setProvider(event.target.value);setCategory('')}}>
        {providers.map(value=><SelectItem key={value} value={value} text={value==='gelato'?'Gelato':'Prodigi'} />)}
      </Select>
      <Select id="native-category" labelText={t('Categoría','Category')} value={category} onChange={event=>setCategory(event.target.value)}>
        <SelectItem value="" text={t('Elegir categoría','Choose category')} />
        {(result?.provider===provider?result.categories || []:[]).map(item=><SelectItem key={item.id} value={item.id} text={item.titles[lang==='en'?1:0]} />)}
      </Select>
      <TextInput id="native-presentation-search" labelText={t('Buscar presentación','Search presentations')} value={query} onChange={event=>setQuery(event.target.value)} />
    </div>
    {category && <div className={common.row}>
      <Button kind="tertiary" size="sm" disabled={loading || busy || wait>0} onClick={refreshCatalog}>{t('Actualizar catálogo','Refresh catalog')}</Button>
      {hasResults && result.saved && <p>{t('Mostrando configuraciones de la última consulta completa.','Showing configurations from the last complete discovery.')}</p>}
    </div>}
    {loading && <p role="status">{t('Descubriendo todas las páginas; no se muestran resultados parciales como completos.','Discovering every page; partial results are not represented as complete.')} {progress.done}/{progress.total} · {progress.pages} {t('páginas','pages')}</p>}
    {error && <><p role="alert">{hasResults ? t('No se completó la actualización. Se conserva el catálogo anterior.','Refresh did not complete. The previous catalog is still available.') : t('Descubrimiento incompleto. Reintenta para continuar desde el punto verificado.','Discovery incomplete. Retry to resume from the verified checkpoint.')} {error.code}</p><Button kind="tertiary" disabled={loading || wait>0} onClick={hasResults ? refreshCatalog : ()=>setRetry(value=>value+1)}>{t('Reintentar','Retry')}{wait>0?` (${wait}s)`:''}</Button></>}
    <div className={styles.cards} aria-busy={loading}>
      {loading && !hasResults?<SkeletonText paragraph lineCount={4} />:items.map(item=><article className={styles.card} key={item.id}>
        <div className={styles.placeholder}><ImageIcon size={32} aria-hidden="true" /><span>{t('Fotografía autorizada no disponible','Authorized photograph unavailable')}</span></div>
        <Tag>{provider==='gelato'?'Gelato':'Prodigi'}</Tag><h3>{item.titles[lang==='en'?1:0]}</h3><p>{item.description?.[lang==='en'?1:0]}</p>
        <p>{t('Tamaños verificados','Verified sizes')}: {item.sizeSummary?.join(' · ') || t('Consultar configuración','See configuration')}</p>
        <Button size="sm" disabled={busy} onClick={()=>onConfigure(item)}>{t('Configurar presentación','Configure presentation')}</Button>
      </article>)}
    </div>
    {category && current && result.complete && !loading && !items.length && !error && <p>{t('No hay presentaciones verificadas para esta búsqueda.','No verified presentations match this search.')}</p>}
  </section>
}
