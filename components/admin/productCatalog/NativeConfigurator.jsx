'use client'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {Button,Checkbox,Select,SelectItem,SkeletonText} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {configurationLabel} from '@/lib/productCatalog/presentations'
import {studioValue} from '@/lib/productCatalog/studioDiscovery'
import {configurationCompatibility,matchesAttributes,previewConfiguration,variantOrientation} from '@/lib/productCatalog/configuration'
import {expandPrintPresentations} from '@/lib/printPresentation'
import {readStudioMatrix,newMatrixCheckpoint,matrixConfigurationId,matrixDimensions,matrixCells,matrixCacheKey} from '@/lib/productCatalog/dynamicMatrix'
import {callCatalog} from './useCatalog'
import {supportsPrintBorder} from '@/lib/productCatalog/wallArt'
import PrintBorderSelect from './PrintBorderSelect'
import WallArtMockup from './WallArtMockup'
import common from './ProductCatalog.module.css'
import styles from './DynamicMatrix.module.css'

export default function NativeConfigurator({group,image,geometry,availablePrints=[],artworkId,onRefreshMasters,country,currency,busy,selected,onAdd,onAddMany,onRemove,onClear,onValidation,onBorderChange,onFitChange}) {
  const {t,lang}=useI18n()
  const [state,setState]=useState(newMatrixCheckpoint)
  const checkpoint=useRef(newMatrixCheckpoint())
  const [error,setError]=useState(null)
  const [loading,setLoading]=useState(true)
  const [retry,setRetry]=useState(0)
  const [filters,setFilters]=useState({})
  const [orientation,setOrientation]=useState('')
  const [axes,setAxes]=useState(null)
  const [visible,setVisible]=useState(100)
  const [focus,setFocus]=useState('')
  const [borderMm,setBorderMm]=useState(0)
  const [fit,setFit]=useState('contain')
  const [cost,setCost]=useState(null)
  const [costError,setCostError]=useState('')
  const [clock,setClock]=useState(0)
  const refreshRequest=useRef(false)
  const validation=useRef(onValidation)
  useEffect(()=>{validation.current=onValidation},[onValidation])
  const cacheKey=matrixCacheKey({...group,country})
  useEffect(()=>{
    const abort=new AbortController()
    const timer=setTimeout(async()=>{
      setLoading(true);setError(null)
      try {
        const refresh=refreshRequest.current
        refreshRequest.current=false
        const snapshot=await readStudioMatrix({refresh,
          loadSnapshot:(input,options)=>callCatalog('nativeMatrixSnapshot',input,options),
          input:{provider:group.provider,catalogId:group.catalogId,presentationId:group.presentationId,country},
          loadPage:(input,options)=>callCatalog('nativeMatrixPage',input,options),checkpoint:checkpoint.current,signal:abort.signal,
          onProgress:value=>{
            if(value.candidates)checkpoint.current=value
            if(!abort.signal.aborted)setState(previous=>value.candidates ? value : {...previous,pages:value.pages,complete:false})
          },
        })
        if(abort.signal.aborted)return
        const result=snapshot.value
        checkpoint.current=result;setState({...result,stale:snapshot.source?.stale===true})

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
  const eligible=state.complete ? state.candidates.flatMap(row=>expandPrintPresentations(row,availablePrints,geometry.orientation)) : []
  useEffect(()=>{if(state.complete)validation.current?.(group.id,state.candidates.flatMap(row=>expandPrintPresentations(row,availablePrints,geometry.orientation)))},[state.complete,state.candidates,availablePrints,geometry.orientation,group.id])
  const orientations=new Set(eligible.map(row=>variantOrientation(row).orientation))
  const rows=eligible.filter(row=>!orientation || !orientations.has(orientation) || variantOrientation(row).orientation===orientation)
  const dimensions=matrixDimensions(rows).filter(key=>key!=='orientation')
  const activeAxes=(axes || dimensions.slice(0,2)).filter(key=>dimensions.includes(key))
  const rowAxis=activeAxes[0],columnAxis=activeAxes[1]
  const grid=matrixCells(rows,{rowAxis,columnAxis,filters})
  const cells=grid || []
  const filtered=rows.filter(row=>matchesAttributes(row.attributes,filters))
  const selectedRows=selected.filter(row=>row.series===group.id)
  const selectedIds=new Set(selectedRows.map(row=>matrixConfigurationId(row.variant)))
  const variant=previewConfiguration(filtered,focus,matrixConfigurationId)
  const currentChoice=selectedRows.find(row=>matrixConfigurationId(row.variant)===matrixConfigurationId(variant || {}))
  const currentFit=currentChoice?.fit || fit
  const compatibility=configurationCompatibility(geometry,variant || {},currentFit)
  const label=key=>t(...configurationLabel(key))
  const filterValues=key=>{
    const otherFilters=Object.fromEntries(Object.entries(filters).filter(([field])=>field!==key))
    return [...new Set(rows.filter(row=>matchesAttributes(row.attributes,otherFilters)).map(row=>row.attributes[key]).filter(Boolean))]
  }
  const describe=row=>Object.entries(row.attributes || {}).map(([key,value])=>`${label(key)}: ${t(...studioValue(value))}`).join(' · ') || (row.widthMm && row.heightMm ? `${row.widthMm} × ${row.heightMm} mm` : t('Configuración','Configuration')+' '+(rows.indexOf(row)+1))
  const isSelected=row=>selectedIds.has(matrixConfigurationId(row))
  const borderFor=row=>{
    if(row?.artworkPrintId)return row.previewIsPrepared ? 0 : row.presentationBorderMm || 0
    if (!row || !supportsPrintBorder(group.group)) return 0
    const chosen = selectedRows.find(item=>matrixConfigurationId(item.variant)===matrixConfigurationId(row))
    const width = chosen ? chosen.borderMm || 0 : borderMm
    return Math.min(row.widthMm,row.heightMm)>2*width ? width : 0
  }
  async function choose(row,checked) {
    setFocus(matrixConfigurationId(row));setCost(null)
    if(!checked)return onRemove?.(matrixConfigurationId(row))
    return onAdd({...row,native:{selection:{},offset:row.discoveryOffset}},row.artworkPrintId ? 'contain' : fit,borderFor(row))
  }
  function selectMany(items) {
    const choices=items.filter(row=>!isSelected(row)).map(row=>({
      variant:{...row,native:{selection:{},offset:row.discoveryOffset}},
      fit:row.artworkPrintId ? 'contain' : fit,borderMm:borderFor(row),
    }))
    onAddMany(choices)
  }
  const canSelect=!busy && state.complete
  const retryWait=Math.max(0,Math.ceil(((error?.retryAt || 0)-clock)/1000))
  const diagnostic=[error?.code,error?.providerOperation,error?.responseField].filter(value=>typeof value==='string' && /^[a-zA-Z0-9_.\[\]]{1,120}$/.test(value)).join(' · ')
  function refresh() {
    refreshRequest.current=true;checkpoint.current=newMatrixCheckpoint();setState(checkpoint.current);setAxes(null);setFilters({});setOrientation('');setFocus('');setCost(null);setRetry(value=>value+1)
  }
  async function quote() {
    if(!variant)return
    setCostError('')
    try {setCost({id:matrixConfigurationId(variant),...await callCatalog('studioVariantCost',{provider:group.provider,variantId:variant.externalVariantId,country,currency})})}
    catch {setCostError(t('Cotización sin confirmar; requiere revisión.','Quotation unconfirmed; review required.'))}
  }
  const currentCost=variant && cost?.id===matrixConfigurationId(variant) && cost.country===country && cost.currency===currency ? cost : null
  const check=(row,scope='list')=><div className={styles.choice} key={matrixConfigurationId(row)}>
    <div style={{width:180,maxWidth:'100%'}}><WallArtMockup image={row.presentationPreview || image} alt={describe(row)} variant={row} fit="contain" borderMm={borderFor(row)} framed={['framed_print','framed_canvas'].includes(group.group)} /></div>
    <Checkbox id={'matrix-choice-'+scope+'-'+rows.indexOf(row)} labelText={describe(row)} checked={isSelected(row)} disabled={busy || (!isSelected(row) && !canSelect)} onChange={(_,data)=>choose(row,data.checked)} />
    <small>{t('Cotización por confirmar','Quotation pending')}{!row.countries?.length ? ' · '+t('Destino sin confirmar','Destination unconfirmed') : ''}</small>
    <Button kind="ghost" size="sm" onClick={()=>{setFocus(matrixConfigurationId(row));setCost(null)}}>{t('Inspeccionar','Inspect')}</Button>
  </div>
  const completeNotice=t('Configuraciones completas para esta presentación y destino.','Complete configurations for this presentation and destination.')
  return <div className={common.section}>
    <p role="status" aria-live="polite">{loading ? t('Descubriendo todas las configuraciones…','Discovering all configurations…') : state.complete ? (state.stale ? t('Se muestra la última matriz completa guardada.','Showing the last saved complete matrix.') : completeNotice) : t('Descubrimiento incompleto. No se puede seleccionar todavía.','Discovery incomplete. Selection is unavailable.')} {state.pages} {t('páginas','pages')} · {state.candidates.length} {t('configuraciones únicas','unique configurations')}</p>
    {loading && <SkeletonText paragraph lineCount={2} />}
    {state.retrying && loading && <p>{t('Reintento limitado del proveedor','Bounded supplier retry')} {state.attempt}/2</p>}
    {error && <><p role="alert">{error.code==='matrix_configurations_unresolved' ? t('El proveedor no reportó las combinaciones de algunas opciones. No se pueden certificar ni seleccionar todavía.','The supplier did not report compatible combinations for some options. They cannot be certified or selected yet.') : t('La consulta quedó incompleta. Reintenta para continuar desde el último punto verificado.','The query is incomplete. Retry to continue from the last verified checkpoint.')} {diagnostic}</p>
      <Button kind="tertiary" disabled={loading || retryWait>0} onClick={()=>setRetry(value=>value+1)}>{t('Reintentar','Retry')}{retryWait>0 ? ` (${retryWait}s)` : ''}</Button></>}
    <Button kind="ghost" disabled={loading || busy} onClick={refresh}>{t('Actualizar configuraciones','Refresh configurations')}</Button>
    {state.complete && <>
      <p>{state.presentation?.materialSummary?.[lang==='en'?1:0]}</p>
      <div className={common.row}>
        <Button kind="ghost" disabled={busy} onClick={onRefreshMasters}>{t('Actualizar tamaños disponibles','Refresh available sizes')}</Button>
        {!eligible.length && <Link href={`/admin/prints?artwork=${artworkId}`} target="_blank" rel="noreferrer">
          {t('Configurar tamaños en Artwork Prints','Configure sizes in Artwork Prints')}
        </Link>}
      </div>
      {!eligible.length && <p role="status">{t('No hay un Artwork Print activo con un tamaño compatible para esta presentación.','No active Artwork Print has a compatible size for this presentation.')}</p>}
      {eligible.length>0 && <p>{t('Tamaño habilitado por un Artwork Print activo. El maestro puede cargarse después; producción requiere validación.','Size enabled by an active Artwork Print. Upload the master later; production still requires validation.')}</p>}
      {orientations.size>1 && <Select id="studio-config-orientation" labelText={t('Orientación de la variante','Variant orientation')} value={orientations.has(orientation) ? orientation : ''}
        onChange={event=>{setOrientation(event.target.value);setFilters({});setFocus('');setCost(null);setVisible(100)}}>
        <SelectItem value="" text={t('Todas las orientaciones compatibles','All compatible orientations')} />
        {orientations.has('portrait') && <SelectItem value="portrait" text={t('Vertical','Portrait')} />}
        {orientations.has('landscape') && <SelectItem value="landscape" text={t('Horizontal','Landscape')} />}
        {orientations.has('square') && <SelectItem value="square" text={t('Cuadrada','Square')} />}
      </Select>}
      {state.candidates.some(row=>!variantOrientation(row).orientation) && <p>{t('Algunas variantes no tienen orientación confirmada.',
        'Some variants have no confirmed orientation.')}</p>}
      {state.candidates.some(row=>variantOrientation(row).conflict) && <p>{t('Las configuraciones con orientación y dimensiones contradictorias requieren revisión del proveedor.',
        'Configurations with conflicting orientation and dimensions require supplier review.')}</p>}
      {dimensions.length>1 && <div className={common.row}>{[0,1].map(index=><Select key={index} id={'matrix-axis-'+index} labelText={index===0?t('Filas','Rows'):t('Columnas','Columns')} value={activeAxes[index] || ''} onChange={event=>{const next=[...activeAxes];next[index]=event.target.value;setAxes([...new Set(next.filter(Boolean))]);setFilters({})}}>
        <SelectItem value="" text={t('Sin eje','No axis')} />{dimensions.map(key=><SelectItem key={key} value={key} text={label(key)} />)}
      </Select>)}</div>}
      <div className={common.row}>{dimensions.map(key=><Select key={key} id={'matrix-filter-'+key} labelText={label(key)} value={filters[key] || ''} onChange={event=>{setFocus('');setCost(null);setFilters(previous=>({...previous,[key]:event.target.value}));setVisible(100)}}>
        <SelectItem value="" text={t('Todas las opciones','All options')} />{filterValues(key).map(value=><SelectItem key={value} value={value} text={t(...studioValue(value))} />)}
      </Select>)}</div>
      <div className={common.row}>
        <Button kind="tertiary" disabled={!canSelect || !eligible.length} onClick={()=>selectMany(eligible)}>{t('Seleccionar todas las combinaciones válidas','Select all valid combinations')}</Button>
        {filtered.length!==eligible.length && <Button kind="ghost" disabled={!canSelect || !filtered.length} onClick={()=>selectMany(filtered)}>{t('Seleccionar resultados filtrados','Select filtered results')}</Button>}
        <Button kind="ghost" disabled={busy || !selectedRows.length} onClick={onClear}>{t('Limpiar selección de esta presentación','Clear presentation selection')}</Button>
      </div>
      {grid && rowAxis && columnAxis ? <div className={styles.table}><table><caption>{t('Matriz dinámica de configuraciones','Dynamic configuration matrix')}</caption>
        <thead><tr><th scope="col">{label(rowAxis)} / {label(columnAxis)}</th>{[...new Set(cells.map(cell=>cell.column))].map(value=><th scope="col" key={value}>{t(...studioValue(value))}<Button kind="ghost" size="sm" disabled={!canSelect} onClick={()=>selectMany(cells.filter(cell=>cell.column===value && cell.state!=='unavailable').flatMap(cell=>cell.candidates))}>{t('Seleccionar columna','Select column')}</Button></th>)}</tr></thead>
        <tbody>{[...new Set(cells.map(cell=>cell.row))].map(value=><tr key={value}><th scope="row">{t(...studioValue(value))}<Button kind="ghost" size="sm" disabled={!canSelect} onClick={()=>selectMany(cells.filter(cell=>cell.row===value && cell.state!=='unavailable').flatMap(cell=>cell.candidates))}>{t('Seleccionar fila','Select row')}</Button></th>
          {cells.filter(cell=>cell.row===value).map((cell,index)=><td key={index}>{cell.candidates.length ? cell.candidates.map(row=>check(row,'cell')) : <span aria-disabled="true">{t('No existe esta combinación','Combination unavailable')}</span>}</td>)}</tr>)}</tbody></table></div> : null}
      <div className={grid && rowAxis && columnAxis ? styles.mobile : ''}>
        <p>{t('Lista accesible de configuraciones','Accessible configuration list')} · {Math.min(visible,filtered.length)}/{filtered.length}</p>
        {filtered.slice(0,visible).map(row=>check(row))}
        {filtered.length>visible && <Button kind="ghost" onClick={()=>setVisible(value=>value+100)}>{t('Mostrar más configuraciones','Show more configurations')}</Button>}
      </div>
      {!filtered.length && <p role="status">{t('No hay combinaciones compatibles con estos filtros. Cambia o borra una opción.','No combinations match these filters. Change or clear an option.')} {Object.keys(filters).filter(key=>filters[key]).map(label).join(' · ')}</p>}
      <p>{selectedRows.length} {t('seleccionadas en esta presentación; los filtros no eliminan selecciones.','selected in this presentation; filters retain selections.')}</p>
      <div className={common.cols}>
        <div>{variant && <><WallArtMockup image={variant.presentationPreview || image} alt="" variant={variant} fit={currentFit} borderMm={borderFor(variant)} framed={['framed_print','framed_canvas'].includes(group.group)} /><p>{t('Vista ilustrativa de JBU; no es una fotografía del proveedor.','Illustrative JBU preview; this is not supplier photography.')}</p></>}
          {compatibility.known && <p>{compatibility.effectiveDpi} {t('ppp estimados','estimated dpi')} · {Math.round(100*(currentFit==='cover'?compatibility.cropFraction:compatibility.borderFraction))}% {t('recorte o borde; validar producción','crop or border; validate production')}</p>}
          {variant && geometry.known && variantOrientation(variant).orientation &&
            geometry.orientation!==variantOrientation(variant).orientation && <p>{t('La orientación difiere de la obra. Revisa la composición antes de producción.',
              'The orientation differs from the artwork. Review composition before production.')}</p>}
          <Select disabled={Boolean(variant?.artworkPrintId)} id="native-fit" labelText={t('Encuadre','Fit')} value={currentFit} onChange={event=>currentChoice ? onFitChange(currentChoice.rowKey,event.target.value) : setFit(event.target.value)}><SelectItem value="contain" text={t('Imagen completa con bordes','Whole image with borders')} /><SelectItem value="cover" text={t('Rellenar con recorte','Fill with crop')} /></Select>
          {!variant?.artworkPrintId && variant?.widthMm > 0 && variant.heightMm > 0 && supportsPrintBorder(group.group) &&
            <PrintBorderSelect id="native-white-border" variant={variant} value={borderFor(variant)}
              onChange={mm=>{
                setBorderMm(mm)
                const selectedRow=selectedRows.find(row=>matrixConfigurationId(row.variant)===matrixConfigurationId(variant))
                if(selectedRow) onBorderChange(selectedRow.rowKey,mm)
              }} />}
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

