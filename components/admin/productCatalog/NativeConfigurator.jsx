'use client'
import {useEffect,useRef,useState} from 'react'
import {Button,Checkbox,Select,SelectItem,SkeletonText} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {studioValue} from '@/lib/productCatalog/studioDiscovery'
import {configurationCompatibility,matchesAttributes} from '@/lib/productCatalog/configuration'
import {discoverMatrix,newMatrixCheckpoint,matrixConfigurationId,matrixDimensions,matrixCells,completedMatrixCache,matrixCacheKey} from '@/lib/productCatalog/dynamicMatrix'
import {callCatalog} from './useCatalog'
import WallArtMockup from './WallArtMockup'
import common from './ProductCatalog.module.css'
import styles from './DynamicMatrix.module.css'

const completed=completedMatrixCache
const labels={size:['Tamaño','Size'],orientation:['Orientación','Orientation'],paper:['Papel','Paper'],finish:['Acabado','Finish'],material:['Material','Material'],frame_material:['Material del marco','Frame material'],frame_color:['Color del marco','Frame color'],glazing:['Cubierta','Glazing'],mount:['Montaje','Mounting']}
export default function NativeConfigurator({group,image,geometry,country,currency,busy,selected,onAdd,onRemove,onValidation}) {
  const {t,lang}=useI18n()
  const [state,setState]=useState(newMatrixCheckpoint)
  const checkpoint=useRef(newMatrixCheckpoint())
  const [error,setError]=useState(null)
  const [loading,setLoading]=useState(true)
  const [retry,setRetry]=useState(0)
  const [filters,setFilters]=useState({})
  const [axes,setAxes]=useState(null)
  const [visible,setVisible]=useState(100)
  const [focus,setFocus]=useState('')
  const [fit,setFit]=useState('contain')
  const [cost,setCost]=useState(null)
  const [costError,setCostError]=useState('')
  const [clock,setClock]=useState(0)
  const validation=useRef(onValidation)
  useEffect(()=>{validation.current=onValidation},[onValidation])
  const cacheKey=matrixCacheKey({...group,country})
  useEffect(()=>{
    const abort=new AbortController()
    const timer=setTimeout(async()=>{
      setLoading(true);setError(null)
      try {
        const cached=completed.get(cacheKey)
        const result=cached && cached.expiresAt>Date.now() && retry===0 ? cached.value : await discoverMatrix({
          input:{provider:group.provider,catalogId:group.catalogId,presentationId:group.presentationId,country},
          loadPage:(input,options)=>callCatalog('nativeMatrixPage',input,options),checkpoint:checkpoint.current,signal:abort.signal,
          onProgress:value=>{checkpoint.current=value;if(!abort.signal.aborted)setState(value)},
        })
        if(abort.signal.aborted)return
        checkpoint.current=result;setState(result)
        completed.set(cacheKey,{value:result,expiresAt:Date.now()+5*60000})
        validation.current?.(group.id,result.candidates)
      } catch(err) {
        if(abort.signal.aborted)return
        if(err.checkpoint)checkpoint.current=err.checkpoint
        setError(err);setClock(Date.now())
      } finally {if(!abort.signal.aborted)setLoading(false)}
    },0)
    return ()=>{clearTimeout(timer);abort.abort()}
  },[group.provider,group.catalogId,group.presentationId,group.id,country,cacheKey,retry])
  useEffect(()=>{
    if(!error?.retryAt)return
    const timer=setInterval(()=>setClock(Date.now()),1000)
    return ()=>clearInterval(timer)
  },[error])
  const rows=state.complete ? state.candidates : []
  const dimensions=matrixDimensions(rows)
  const activeAxes=(axes || dimensions.slice(0,2)).filter(key=>dimensions.includes(key))
  const rowAxis=activeAxes[0],columnAxis=activeAxes[1]
  const grid=matrixCells(rows,{rowAxis,columnAxis,filters})
  const cells=grid || []
  const filtered=rows.filter(row=>matchesAttributes(row.attributes,filters))
  const selectedRows=selected.filter(row=>row.series===group.id)
  const selectedIds=new Set(selectedRows.map(row=>matrixConfigurationId(row.variant)))
  const variant=rows.find(row=>matrixConfigurationId(row)===focus) || (filtered.length===1 ? filtered[0] : null)
  const compatibility=configurationCompatibility(geometry,variant || {},fit)
  const label=key=>labels[key] ? t(...labels[key]) : key
  const describe=row=>Object.entries(row.attributes || {}).map(([key,value])=>`${label(key)}: ${t(...studioValue(value))}`).join(' · ') || (row.widthMm && row.heightMm ? `${row.widthMm} × ${row.heightMm} mm` : t('Configuración','Configuration')+' '+(rows.indexOf(row)+1))
  const isSelected=row=>selectedIds.has(matrixConfigurationId(row))
  async function choose(row,checked) {
    setFocus(matrixConfigurationId(row));setCost(null)
    if(!checked)return onRemove?.(matrixConfigurationId(row))
    return onAdd({...row,native:{selection:{},offset:row.discoveryOffset}},fit)
  }
  async function selectMany(items) {
    let remaining=12-selected.length
    for(const row of items.filter(row=>!isSelected(row))) {
      if(remaining--<=0)break
      if(await choose(row,true)===false)break
    }
  }
  const valid=grid ? cells.filter(cell=>cell.state==='available').map(cell=>cell.candidates[0]) : filtered.slice(0,visible)
  const canSelect=!busy && state.complete && selected.length<12
  const retryWait=Math.max(0,Math.ceil(((error?.retryAt || 0)-clock)/1000))
  const diagnostic=[error?.code,error?.providerOperation,error?.responseField].filter(value=>typeof value==='string' && /^[a-zA-Z0-9_.\[\]]{1,120}$/.test(value)).join(' · ')
  function refresh() {
    completed.delete(cacheKey);checkpoint.current=newMatrixCheckpoint();setState(checkpoint.current);setAxes(null);setFilters({});setFocus('');setCost(null);setRetry(value=>value+1)
  }
  async function quote() {
    if(!variant)return
    setCostError('')
    try {setCost({id:matrixConfigurationId(variant),...await callCatalog('studioVariantCost',{provider:group.provider,variantId:variant.externalVariantId,country,currency})})}
    catch {setCostError(t('Cotización sin confirmar; requiere revisión.','Quotation unconfirmed; review required.'))}
  }
  const currentCost=variant && cost?.id===matrixConfigurationId(variant) && cost.country===country && cost.currency===currency ? cost : null
  const check=(row,scope='list')=><div className={styles.choice} key={matrixConfigurationId(row)}>
    <Checkbox id={'matrix-choice-'+scope+'-'+rows.indexOf(row)} labelText={describe(row)} checked={isSelected(row)} disabled={busy || (!isSelected(row) && !canSelect)} onChange={(_,data)=>choose(row,data.checked)} />
    <small>{t('Cotización por confirmar','Quotation pending')}{!row.countries?.length ? ' · '+t('Destino sin confirmar','Destination unconfirmed') : ''}</small>
    <Button kind="ghost" size="sm" onClick={()=>{setFocus(matrixConfigurationId(row));setCost(null)}}>{t('Inspeccionar','Inspect')}</Button>
  </div>
  const completeNotice=t('Configuraciones completas para esta presentación y destino.','Complete configurations for this presentation and destination.')
  return <div className={common.section}>
    <p role="status" aria-live="polite">{loading ? t('Descubriendo todas las configuraciones…','Discovering all configurations…') : state.complete ? completeNotice : t('Descubrimiento incompleto. No se puede seleccionar todavía.','Discovery incomplete. Selection is unavailable.')} {state.pages} {t('páginas','pages')} · {state.candidates.length} {t('configuraciones únicas','unique configurations')}</p>
    {loading && <SkeletonText paragraph lineCount={2} />}
    {state.retrying && loading && <p>{t('Reintento limitado del proveedor','Bounded supplier retry')} {state.attempt}/2</p>}
    {error && <><p role="alert">{error.code==='matrix_configurations_unresolved' ? t('El proveedor no reportó las combinaciones de algunas opciones. No se pueden certificar ni seleccionar todavía.','The supplier did not report compatible combinations for some options. They cannot be certified or selected yet.') : t('La consulta quedó incompleta. Reintenta para continuar desde el último punto verificado.','The query is incomplete. Retry to continue from the last verified checkpoint.')} {diagnostic}</p>
      <Button kind="tertiary" disabled={loading || retryWait>0} onClick={()=>setRetry(value=>value+1)}>{t('Reintentar','Retry')}{retryWait>0 ? ` (${retryWait}s)` : ''}</Button></>}
    <Button kind="ghost" disabled={loading || busy} onClick={refresh}>{t('Actualizar configuraciones','Refresh configurations')}</Button>
    {state.complete && <>
      <p>{state.presentation?.materialSummary?.[lang==='en'?1:0]}</p>
      {dimensions.length>1 && <div className={common.row}>{[0,1].map(index=><Select key={index} id={'matrix-axis-'+index} labelText={index===0?t('Filas','Rows'):t('Columnas','Columns')} value={activeAxes[index] || ''} onChange={event=>{const next=[...activeAxes];next[index]=event.target.value;setAxes([...new Set(next.filter(Boolean))]);setFilters({})}}>
        <SelectItem value="" text={t('Sin eje','No axis')} />{dimensions.map(key=><SelectItem key={key} value={key} text={label(key)} />)}
      </Select>)}</div>}
      <div className={common.row}>{dimensions.filter(key=>!activeAxes.includes(key)).map(key=><Select key={key} id={'matrix-filter-'+key} labelText={label(key)} value={filters[key] || ''} onChange={event=>{setFilters(previous=>({...previous,[key]:event.target.value}));setVisible(100)}}>
        <SelectItem value="" text={t('Todas las opciones','All options')} />{[...new Set(rows.map(row=>row.attributes[key]).filter(Boolean))].map(value=><SelectItem key={value} value={value} text={t(...studioValue(value))} />)}
      </Select>)}</div>
      <div className={common.row}>
        <Button kind="tertiary" disabled={!canSelect || !valid.length} onClick={()=>selectMany(valid)}>{t('Seleccionar combinaciones válidas visibles','Select valid visible combinations')}</Button>
        <Button kind="ghost" disabled={busy || !selectedRows.length} onClick={async()=>{for(const row of selectedRows)await onRemove?.(matrixConfigurationId(row.variant))}}>{t('Limpiar selección de esta presentación','Clear presentation selection')}</Button>
      </div>
      {grid && rowAxis && columnAxis ? <div className={styles.table}><table><caption>{t('Matriz dinámica de configuraciones','Dynamic configuration matrix')}</caption>
        <thead><tr><th scope="col">{label(rowAxis)} / {label(columnAxis)}</th>{[...new Set(cells.map(cell=>cell.column))].map(value=><th scope="col" key={value}>{t(...studioValue(value))}<Button kind="ghost" size="sm" disabled={!canSelect} onClick={()=>selectMany(cells.filter(cell=>cell.column===value && cell.state==='available').map(cell=>cell.candidates[0]))}>{t('Seleccionar columna','Select column')}</Button></th>)}</tr></thead>
        <tbody>{[...new Set(cells.map(cell=>cell.row))].map(value=><tr key={value}><th scope="row">{t(...studioValue(value))}<Button kind="ghost" size="sm" disabled={!canSelect} onClick={()=>selectMany(cells.filter(cell=>cell.row===value && cell.state==='available').map(cell=>cell.candidates[0]))}>{t('Seleccionar fila','Select row')}</Button></th>
          {cells.filter(cell=>cell.row===value).map((cell,index)=><td key={index}>{cell.state==='available' ? check(cell.candidates[0],'cell') : <span aria-disabled="true">{cell.state==='ambiguous' ? `${cell.candidates.length} · `+t('Aplica filtros para resolver','Filter to resolve') : t('No existe esta combinación','Combination unavailable')}</span>}</td>)}</tr>)}</tbody></table></div> : null}
      <div className={grid && rowAxis && columnAxis ? styles.mobile : ''}>
        <p>{t('Lista accesible de configuraciones','Accessible configuration list')} · {Math.min(visible,filtered.length)}/{filtered.length}</p>
        {filtered.slice(0,visible).map(row=>check(row))}
        {filtered.length>visible && <Button kind="ghost" onClick={()=>setVisible(value=>value+100)}>{t('Mostrar más configuraciones','Show more configurations')}</Button>}
      </div>
      {!filtered.length && <p role="status">{t('No hay combinaciones compatibles con estos filtros. Cambia o borra una opción.','No combinations match these filters. Change or clear an option.')} {Object.keys(filters).filter(key=>filters[key]).map(label).join(' · ')}</p>}
      <p>{selectedRows.length} {t('seleccionadas en esta presentación; los filtros no eliminan selecciones. Máximo 12 por sesión.','selected in this presentation; filters retain selections. Maximum 12 per session.')}</p>
      <div className={common.cols}>
        <div><WallArtMockup image={image} alt="" variant={variant || {}} fit={fit} framed={['framed_print','framed_canvas'].includes(group.group)} /><p>{t('Vista ilustrativa de JBU; no es una fotografía del proveedor.','Illustrative JBU preview; this is not supplier photography.')}</p>
          {compatibility.known && <p>{compatibility.effectiveDpi} {t('ppp estimados','estimated dpi')} · {Math.round(100*(fit==='cover'?compatibility.cropFraction:compatibility.borderFraction))}% {t('recorte o borde; validar producción','crop or border; validate production')}</p>}
          <Select id="native-fit" labelText={t('Encuadre','Fit')} value={fit} onChange={event=>setFit(event.target.value)}><SelectItem value="contain" text={t('Imagen completa con bordes','Whole image with borders')} /><SelectItem value="cover" text={t('Rellenar con recorte','Fill with crop')} /></Select>
        </div>
        <div>{variant && <p>{describe(variant)}</p>}
          {group.provider==='gelato' && <Button kind="tertiary" disabled={!variant || !currency} onClick={quote}>{t('Consultar costo de fabricación','Request manufacturing cost')}</Button>}
          {currentCost?.manufacturingMinor!=null && <p>{new Intl.NumberFormat(lang,{style:'currency',currency}).format(currentCost.manufacturingMinor/10**new Intl.NumberFormat(lang,{style:'currency',currency}).resolvedOptions().maximumFractionDigits)} · {t('Solo fabricación; envío e impuestos pendientes.','Manufacturing only; shipping and tax pending.')}</p>}
          {costError && <p>{costError}</p>}
          {variant && <details><summary>{t('Detalles técnicos del proveedor','Advanced supplier details')}</summary><p>{variant.externalVariantId}</p><pre className={styles.technical}>{JSON.stringify({catalogId:group.catalogId,configuration:variant.configuration,attributes:variant.sourceAttributes,presentation:state.presentation},null,2)}</pre></details>}
        </div>
      </div>
    </>}
  </div>
}
