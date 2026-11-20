'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Pagination, Select, SelectItem, SkeletonText, Tag, TextInput } from '@carbon/react'
import OptimizedImg from '@/components/media/OptimizedImg'
import { Image as ImageIcon } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { wallArtFamilies } from '@/lib/productCatalog/wallArt'
import { studioValue } from '@/lib/productCatalog/studioDiscovery'
import { callCatalog } from './useCatalog'
import shared from './ProductCatalog.module.css'
import styles from './SupplierCatalogBrowser.module.css'

const attributeLabels={paper:['Papel','Paper'],material:['Material','Material'],frame_material:['Material del marco','Frame material'],finish:['Acabado','Finish'],mount:['Montaje','Mount'],glazing:['Cubierta','Glazing'],stretcher_thickness:['Grosor del bastidor','Stretcher thickness']}
const suppliers={gelato:'Gelato',prodigi:'Prodigi'}
const readinessLabels={ready_for_worker:['Esperando ejecución del trabajador','Waiting for worker invocation'],backoff:['Esperando next_attempt_at','Waiting for next_attempt_at'],leased:['Lote en ejecución','Batch in progress']}
const statusLabels={queued:['En espera','Queued'],running:['Sincronizando','Syncing'],retry:['Reintento pendiente','Retry pending'],
  failed:['Falló','Failed'],complete:['Completo','Complete']}

function SyncStatus({providers,onComplete}) {
  const {t,lang}=useI18n()
  const [states,setStates]=useState([])
  const [working,setWorking]=useState('')
  const [observedAt,setObservedAt]=useState(null)
  const [error,setError]=useState('')
  const controller=useRef(null)
  const load=useCallback(async signal=>{
    const rows=await callCatalog('supplierSyncStatus',{}, {signal})
    setStates(rows);setObservedAt(Date.now())
    return rows
  },[])
  useEffect(()=>{
    const abort=new AbortController()
    const poll=()=>load(abort.signal).catch(()=>{})
    poll()
    const timer=setInterval(poll,10000)
    return ()=>{abort.abort();clearInterval(timer);controller.current?.abort()}
  },[load])
  async function sync(provider,retry) {
    const abort=new AbortController()
    controller.current=abort
    setWorking(provider);setError('')
    try {
      await callCatalog('supplierSyncStart',{provider,retry},{signal:abort.signal})
      // Explicit admin action drives bounded requests. Closing the tab leaves a resumable DB job.
      while(!abort.signal.aborted) {
        const result=await callCatalog('supplierSyncAdvance',{provider},{signal:abort.signal})
        const rows=await load(abort.signal)
        if(result.complete) {onComplete();break}
        if(rows.find(row=>row.provider_code===provider)?.run?.status==='failed')break
        if(result.error && !result.retry)break
        await new Promise(resolve=>{
          const timer=setTimeout(resolve,5000)
          abort.signal.addEventListener('abort',()=>{clearTimeout(timer);resolve()},{once:true})
        })
      }
    } catch(failure) {if(failure.name!=='AbortError')setError(t('No se pudo continuar. El progreso quedó guardado.','Unable to continue. Progress was saved.'))}
    finally {setWorking('')}
  }
  async function schedule(state,enabled) {
    setError('')
    try {await callCatalog('supplierSyncSchedule',{provider:state.provider_code,enabled,intervalHours:24});await load()}
    catch {setError(t('No se pudo guardar el horario.','Unable to save the schedule.'))}
  }
  const date=value=>value ? new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—'
  return <details className={styles.sync}>
    <summary>{t('Administrar sincronización del catálogo','Manage catalog synchronization')}</summary>
    <p>{t('La navegación usa la última revisión completa. Las actualizaciones no cambian productos ni precios de JBU.',
      'Browsing uses the last complete revision. Updates do not change JBU products or prices.')}</p>
    <p>{t('La programación requiere el trabajador cron del servidor. Al cerrar esta página el progreso permanece guardado.',
      'Scheduling requires the server cron worker. Progress remains saved when this page closes.')}</p>
    {states.filter(state=>providers.includes(state.provider_code)).map(state=>{
      const run=state.run
      const stats=state.active?.stats || {}
      const duration=run ? Math.round(((run.completed_at ? Date.parse(run.completed_at) : observedAt)-Date.parse(run.created_at))/1000) : null
      return <article className={shared.item} key={state.provider_code}>
        <h3>{suppliers[state.provider_code]}</h3>
        <p>{run ? t(...statusLabels[run.status]) : t('Sin indexar','Not indexed')} · {t('Última actualización completa','Last complete update')}: {date(state.last_success_at)}</p>
        <p>{t('Catálogo activo','Active catalog')}: {stats.groups || 0} {t('grupos','groups')} · {stats.variants || 0} {t('variantes de fabricación','manufacturing variants')}
          {' · '}{t('Actualizados','Updated')}: {stats.updated || 0} · {t('Retirados','Removed')}: {stats.removed || 0}</p>
        <p>{t('Última invocación del trabajador (cron o administrador)','Last worker invocation (cron or administrator)')}: {date(state.last_worker_at)}</p>
        {run?.readiness && readinessLabels[run.readiness] && <p role="status">{t(...readinessLabels[run.readiness])} · {t('Elegible desde','Eligible from')}: {date(run.next_attempt_at)}</p>}
        {run && <p>{t('Variantes únicas guardadas en esta corrida','Unique variants staged in this run')}: {run.indexedVariants ?? '—'} · {t('Revisión activa','Active revision')}: {state.active_revision || '—'}</p>}
        {run?.checkpoint?.lastProgress && <p>{t('Último lote confirmado','Last committed batch')}: {run.checkpoint.lastProgress.scope} · {t('Offset','Offset')}: {run.checkpoint.lastProgress.offset} · {date(run.checkpoint.lastProgress.committedAt)}</p>}
        {run && <p>{run.pages} {t('lotes confirmados (no páginas únicas)','committed batches (not unique pages)')} · {run.errors} {t('errores','errors')} · {duration} s</p>}
        {run?.last_error && <p role="status">{t('Último error registrado','Last recorded error')}: {run.last_error}
          {run.status==='retry' && ' · '+t('Próximo intento','Next attempt')+': '+date(run.next_attempt_at)}</p>}
        <p>{t('Próxima actualización programada','Next scheduled refresh')}: {date(state.next_refresh_at)}</p>
        <Checkbox id={'supplier-schedule-'+state.provider_code} labelText={t('Actualizar cada 24 horas (requiere cron)','Refresh every 24 hours (requires cron)')}
          checked={state.schedule_enabled} onChange={(_event,{checked})=>schedule(state,checked)} />
        <Button size="sm" kind="tertiary" disabled={!!working} onClick={()=>sync(state.provider_code,run?.status==='failed')}>
          {working===state.provider_code ? t('Sincronizando…','Syncing…') : run && run.status!=='complete' ? t('Continuar / reintentar','Continue / retry') : t('Sincronizar catálogo','Synchronize catalog')}</Button>
        {working===state.provider_code && <Button size="sm" kind="ghost" onClick={()=>controller.current?.abort()}>{t('Pausar','Pause')}</Button>}
      </article>
    })}
    {error && <p role="alert">{error}</p>}
  </details>
}

function SupplierImage({metadata,index}) {
  const {t}=useI18n()
  const [failed,setFailed]=useState(false)
  if(metadata.image && !failed)return <figure><OptimizedImg src={metadata.image.image_url} alt={metadata.titles[index]}
    className={styles.supplierImage} sizes="400px" onFinalError={()=>setFailed(true)} />
    <figcaption>{t('Fotografía del proveedor · uso verificado','Supplier photograph · verified usage')}</figcaption></figure>
  return <div className={styles.placeholder}><ImageIcon size={32} aria-hidden="true" />
    <span>{t('Fotografía del proveedor no disponible','Supplier photograph unavailable')}</span></div>
}

export default function SupplierCatalogBrowser({country,providers,initialProvider='all',active,busy,onConfigure}) {
  const {t,lang}=useI18n()
  const index=lang==='en' ? 1 : 0
  const [provider,setProvider]=useState(providers.includes(initialProvider) ? initialProvider : providers.length===1 ? providers[0] : 'all')
  const [family,setFamily]=useState('')
  const [query,setQuery]=useState('')
  const [sort,setSort]=useState('title')
  const [page,setPage]=useState(1)
  const [refresh,setRefresh]=useState(0)
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const scroll=useRef(0)
  const wasActive=useRef(false)
  useEffect(()=>{
    if(active && !wasActive.current)window.scrollTo(0,scroll.current)
    wasActive.current=active
  },[active])
  useEffect(()=>{
    const abort=new AbortController()
    const timer=setTimeout(()=>{
      setLoading(true);setError('')
      callCatalog('studioDiscover',{provider,country,family,query,sort,offset:(page-1)*12},{signal:abort.signal})
        .then(data=>{setResult(data);if(page>1 && !data.groups.length)setPage(1)})
        .catch(failure=>{if(failure.name!=='AbortError')setError(t('No se pudo leer el catálogo guardado.','Unable to read the stored catalog.'))})
        .finally(()=>{if(!abort.signal.aborted)setLoading(false)})
    },250)
    return ()=>{clearTimeout(timer);abort.abort()}
  },[provider,country,family,query,sort,page,refresh,t])
  return <section className={shared.section} hidden={!active}>
    <h2>{t('Catálogo de arte mural','Wall art catalog')}</h2>
    <p>{t('Explora productos y configura sus opciones de fabricación.','Explore products and configure manufacturing options.')}</p>
    <div className={styles.filters}>
      <TextInput id="supplier-query" labelText={t('Buscar producto o especificación','Search products or specifications')} value={query}
        onChange={event=>{setQuery(event.target.value);setPage(1)}} />
      <Select id="supplier-filter" labelText={t('Proveedor','Supplier')} value={provider} onChange={event=>{setProvider(event.target.value);setPage(1)}}>
        {providers.length>1 && <SelectItem value="all" text={t('Todos','All')} />}
        {providers.map(name=><SelectItem key={name} value={name} text={suppliers[name]} />)}
      </Select>
      <Select id="supplier-family" labelText={t('Categoría','Category')} value={family} onChange={event=>{setFamily(event.target.value);setPage(1)}}>
        <SelectItem value="" text={t('Todo el arte mural','All wall art')} />
        {Object.entries(wallArtFamilies).map(([key,value])=><SelectItem key={key} value={key} text={value[index]} />)}
      </Select>
      <Select id="supplier-sort" labelText={t('Ordenar','Sort')} value={sort} onChange={event=>{setSort(event.target.value);setPage(1)}}>
        <SelectItem value="title" text={t('Producto','Product')} /><SelectItem value="supplier" text={t('Proveedor','Supplier')} />
      </Select>
    </div>
    <p role="status" aria-live="polite">{loading ? t('Buscando en el catálogo guardado…','Searching stored catalog…') : `${result?.total || 0} ${t('grupos de productos','product groups')}`}</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.cards} aria-busy={loading}>
      {loading ? Array.from({length:6},(_,key)=><article className={styles.card} key={key}><div className={styles.placeholder} /><SkeletonText heading /><SkeletonText paragraph lineCount={3} /></article>)
        : result?.groups.map(item=>{
          const metadata=item.metadata
          const specs=Object.entries(metadata.specifications || {})
          return <article className={styles.card} key={item.id}>
            <SupplierImage key={metadata.image?.image_url || 'placeholder'} metadata={metadata} index={index} />
            <Tag>{suppliers[item.provider]}</Tag>
            <h3>{metadata.titles[index]}</h3>
            {metadata.supplierName && <p>{metadata.supplierName}</p>}
            <p>{metadata.descriptions[index] || t('Consulta las especificaciones y opciones indexadas de este producto.','Review this product’s indexed specifications and options.')}</p>
            {specs.length>0 && <dl>{specs.map(([key,value])=><div key={key}><dt>{t(...(attributeLabels[key] || studioValue(key)))}</dt><dd>{t(...studioValue(value))}</dd></div>)}</dl>}
            {metadata.sizes?.length>0 && <p>{t('Tamaños','Sizes')}: {metadata.sizes.slice(0,4).map(value=>t(...studioValue(value))).join(' · ')}{metadata.sizes.length>4 ? ` +${metadata.sizes.length-4}` : ''}</p>}
            {metadata.finishes?.length>0 && <p>{t('Acabados','Finishes')}: {metadata.finishes.map(value=>t(...studioValue(value))).join(' · ')}</p>}
            {metadata.frames?.length>0 && <p>{t('Colores del marco','Frame colors')}: {metadata.frames.map(value=>t(...studioValue(value))).join(' · ')}</p>}
            <p>{item.variantCount} {t('variantes de fabricación indexadas','indexed manufacturing variants')}</p>
            <details><summary>{t('Datos técnicos y procedencia','Technical details and provenance')}</summary>
              {metadata.sourceDescription && <p>{metadata.sourceDescription}</p>}<p>{metadata.sourceCatalog}</p><p className={styles.identifier}>{item.id}</p>
              <p>{t('Referencias de imágenes con permiso de uso sin verificar','Image references have unverified usage permissions')}: {metadata.images?.length || 0}</p>
            </details>
            <Button size="sm" disabled={busy} onClick={()=>{scroll.current=window.scrollY;onConfigure(item)}}>{t('Configurar producto','Configure product')}</Button>
          </article>
        })}
    </div>
    {!loading && result && !result.groups.length && <p>{t('No hay productos para estos filtros. Si aún no existe una revisión, inicia la sincronización abajo.','No products match these filters. If no revision exists yet, start synchronization below.')}</p>}
    {result?.total>0 && <Pagination page={page} pageSize={12} pageSizes={[12]} totalItems={result.total} onChange={({page:next})=>setPage(next)}
      backwardText={t('Página anterior','Previous page')} forwardText={t('Página siguiente','Next page')} itemsPerPageText={t('Productos por página','Products per page')}
      itemRangeText={(min,max,total)=>`${min}–${max} ${t('de','of')} ${total}`} pageRangeText={(_current,total)=>`${t('de','of')} ${total} ${t('páginas','pages')}`} />}
    <SyncStatus providers={providers} onComplete={()=>setRefresh(value=>value+1)} />
  </section>
}
