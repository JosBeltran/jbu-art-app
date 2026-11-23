'use client'
import {useEffect,useRef,useState} from 'react'
import {Button,Select,SelectItem,SkeletonText,TextInput,Tag} from '@carbon/react'
import {Image as ImageIcon} from '@carbon/icons-react'
import {useI18n} from '@/components/I18nProvider'
import {sourcePageNext,retryDelay} from '@/lib/productCatalog/dynamicMatrix'
import {callCatalog} from './useCatalog'
import common from './ProductCatalog.module.css'
import styles from './SupplierCatalogBrowser.module.css'

const catalogLabels={
  'framed-posters':['Póster enmarcado','Framed poster'],
  'fine-art-framed-poster':['Fine Art enmarcado','Framed Fine Art'],
  'mounted-framed-posters':['Póster enmarcado con paspartú','Framed poster with mount'],
}

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
      if(refresh || scope.current?.key!==key)scope.current={key,offset:0,metadataDone:false,categories:new Map(),definitions:new Map(),metadataRepeats:0}
      const state=scope.current
      try {
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
          setResult({key,provider,category,categories:[...state.categories.values()],
            presentations:[...state.definitions.values()],complete:state.metadataDone})
        }
      } catch(err) {
        if(abort.signal.aborted)return
        setError(err);setClock(Date.now())
        if(!err.retryAt)err.retryAt=Date.now()+retryDelay(err)
        setResult(previous=>previous?.key===key && previous.complete ? previous : {key,provider,category,categories:[...state.categories.values()],presentations:[...state.definitions.values()],complete:false})
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
    <p>{t('Elige una presentación para consultar sus formatos y acabados disponibles en el destino.','Choose a presentation to check its available formats and finishes for the destination.')}</p>
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
    </div>}
    {loading && <p role="status">{t('Cargando presentaciones del catálogo…','Loading catalog presentations…')}</p>}
    {error && <><p role="alert">{hasResults ? t('No se completó la actualización. Se conserva el catálogo anterior.','Refresh did not complete. The previous catalog is still available.') : t('Descubrimiento incompleto. Reintenta para continuar desde el punto verificado.','Discovery incomplete. Retry to resume from the verified checkpoint.')} {error.code}</p><Button kind="tertiary" disabled={loading || wait>0} onClick={hasResults ? refreshCatalog : ()=>setRetry(value=>value+1)}>{t('Reintentar','Retry')}{wait>0?` (${wait}s)`:''}</Button></>}
    <div className={styles.cards} aria-busy={loading}>
      {loading && !items.length?<SkeletonText paragraph lineCount={4} />:items.map(item=><article className={styles.card} key={item.id}>
        <div className={styles.placeholder}><ImageIcon size={32} aria-hidden="true" /><span>{t('Fotografía autorizada no disponible','Authorized photograph unavailable')}</span></div>
        <Tag>{provider==='gelato'?'Gelato':'Prodigi'}</Tag><h3>{item.titles[lang==='en'?1:0]}</h3>
        {item.provider==='gelato' && catalogLabels[item.catalogId] && <p>{t(...catalogLabels[item.catalogId])}</p>}
        <Button size="sm" disabled={busy} onClick={()=>onConfigure(item)}>{t('Configurar presentación','Configure presentation')}</Button>
      </article>)}
    </div>
    {category && current && result.complete && !loading && !items.length && !error && <p>{t('No hay presentaciones para esta búsqueda.','No presentations match this search.')}</p>}
  </section>
}
