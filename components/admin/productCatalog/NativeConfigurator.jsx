'use client'
import {useEffect,useState} from 'react'
import {Button,Select,SelectItem,SkeletonText} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {studioValue,studioVariantKey} from '@/lib/productCatalog/studioDiscovery'
import {configurationCompatibility} from '@/lib/productCatalog/configuration'
import {callCatalog} from './useCatalog'
import WallArtMockup from './WallArtMockup'
import common from './ProductCatalog.module.css'

const labels={PaperFormat:['Tamaño de papel','Paper size'],FrameSize:['Tamaño del marco','Frame size'],Orientation:['Orientación','Orientation'],
  PaperType:['Papel','Paper'],FrameMaterial:['Material del marco','Frame material'],FrameColor:['Color del marco','Frame color'],
  FrameColour:['Color del marco','Frame color'],CoatingType:['Acabado','Finish'],Glazing:['Cubierta','Glazing'],framecolour:['Color del marco','Frame color'],glaze:['Cubierta','Glazing']}
export default function NativeConfigurator({group,image,geometry,country,currency,busy,selected,onAdd}) {
  const {t,lang}=useI18n()
  const [selection,setSelection]=useState({})
  const [offset,setOffset]=useState(0)
  const [result,setResult]=useState(null)
  const [exact,setExact]=useState('')
  const [fit,setFit]=useState('contain')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  const [cost,setCost]=useState(null)
  const [costError,setCostError]=useState('')
  const key=JSON.stringify({selection,offset,country})
  useEffect(()=>{
    const abort=new AbortController()
    const timer=setTimeout(()=>{
      setLoading(true);setError('')
      callCatalog('nativeConfigure',{provider:group.provider,catalogId:group.catalogId,presentationId:group.presentationId,selection,offset,country},{signal:abort.signal})
        .then(data=>{if(!abort.signal.aborted)setResult({...data,key})})
        .catch(err=>{
          if(err.name==='AbortError')return
          const message=err.code==='invalid_provider_response'
            ? t('El proveedor devolvió datos que JBU no pudo interpretar.','The supplier returned data JBU could not interpret.')
            : err.code==='provider_rate_limited'
              ? t('Límite temporal del proveedor. Reintenta más tarde.','Temporary supplier rate limit. Retry later.')
              : t('La configuración no pudo verificarse. Reintenta o cambia tus opciones.','Configuration could not be verified. Retry or change your options.')
          const diagnostic=[err.code,err.providerOperation,err.responseField].filter(value=>typeof value==='string' && /^[a-zA-Z0-9_.\[\]]{1,120}$/.test(value)).join(' · ')
          setError(message+(diagnostic ? ' ('+diagnostic+')' : ''))
        })
        .finally(()=>{if(!abort.signal.aborted)setLoading(false)})
    },250)
    return ()=>{clearTimeout(timer);abort.abort()}
  // selection and key are the serialized, request-scoped inputs.
  },[group.provider,group.catalogId,group.presentationId,key,country,retry,t,selection,offset])
  const current=result?.key===key
  const variants=current ? result.candidates : []
  const variant=variants.find(row=>studioVariantKey(row)===exact) || (variants.length===1 ? variants[0] : null)
  const compatibility=configurationCompatibility(geometry,variant || {},fit)
  const atLimit=selected.length>=12 || (new Set(selected.map(row=>row.series)).size>=6 && !selected.some(row=>row.series===group.id))
  const chosen=variant && selected.some(row=>row.series===group.id && studioVariantKey(row.variant)===studioVariantKey(variant))
  const options=result?.schema.attributes || []
  async function requestCost() {
    if(!variant)return
    try {
      const value=await callCatalog('studioVariantCost',{provider:group.provider,variantId:variant.externalVariantId,country,currency})
      setCost({key,variant:studioVariantKey(variant),...value})
    } catch {setCostError(t('No se pudo confirmar el costo.','Unable to confirm cost.'))}
  }
  const currentCost=cost?.key===key && cost.currency===currency && cost.country===country && variant && cost.variant===studioVariantKey(variant) ? cost : null
  return <div className={common.cols}>
    <div>
      <WallArtMockup image={image} alt="" variant={variant} fit={fit} framed={['framed_print','framed_canvas'].includes(group.group)} />
      <p>{t('Vista ilustrativa de JBU; no es una fotografía del proveedor.','Illustrative JBU preview; this is not supplier photography.')}</p>
      {compatibility.known ? <p role="status">{compatibility.effectiveDpi} {t('ppp estimados','estimated dpi')} · {Math.round(100*(fit==='cover' ? compatibility.cropFraction : compatibility.borderFraction))}% {fit==='cover' ? t('recorte','crop') : t('borde blanco','white border')}
        {!compatibility.recommended && ' · '+t('Revisar tamaño y encuadre','Review size and fit')}</p> : <p>{t('Resolución o medidas sin confirmar; revisa el archivo de producción.','Resolution or dimensions unconfirmed; review the production file.')}</p>}
      <p>{t('La producción requiere un archivo validado; esta vista no lo certifica.','Production requires a validated file; this preview does not certify readiness.')}</p>
      <Select id="native-fit" labelText={t('Encuadre','Fit')} value={fit} onChange={event=>setFit(event.target.value)}>
        <SelectItem value="contain" text={t('Imagen completa con bordes si son necesarios','Whole image with borders as needed')} />
        <SelectItem value="cover" text={t('Rellenar con recorte','Fill with crop')} />
      </Select>
    </div>
    <div className={common.fields} aria-busy={loading}>
      {result?.presentation && <p>{result.presentation.materialSummary[lang==='en'?1:0]}</p>}
      {geometry?.known && <p>{t('Obra','Artwork')}: {geometry.widthPx} × {geometry.heightPx} px · {t('Proporción','Aspect ratio')} {geometry.aspectRatio.toFixed(2)}. {t('Las recomendaciones no excluyen otros encuadres.','Recommendations do not exclude other framing options.')}</p>}
      {options.map(attribute=>attribute.fixed && attribute.values.length===1 && !selection[attribute.id]
        ? <p key={attribute.id}>{attribute.labels ? t(...attribute.labels) : attribute.title}: {attribute.values[0].title}</p>
        : <Select key={attribute.id} id={'native-attribute-'+attribute.id} labelText={attribute.labels ? t(...attribute.labels) : labels[attribute.id] ? t(...labels[attribute.id]) : attribute.title}
        value={selection[attribute.id] || ''} onChange={event=>{
          const index=options.findIndex(row=>row.id===attribute.id)
          setSelection({...Object.fromEntries(options.slice(0,index).flatMap(row=>selection[row.id] ? [[row.id,selection[row.id]]] : [])),...(event.target.value ? {[attribute.id]:event.target.value} : {})})
          setOffset(0);setExact('');setCost(null)
        }}>
        <SelectItem value="" text={t('Seleccionar / cambiar','Select / change')} />
        {attribute.values.map(value=><SelectItem key={value.id} value={value.id} text={(['black','white','natural-wood','dark-wood','hor','ver'].includes(value.id) ? t(...studioValue(value.id)) : value.title)+
          (attribute.code==='orientation' && ((geometry?.orientation==='portrait' && value.id==='ver') || (geometry?.orientation==='landscape' && value.id==='hor')) ? t(' · Sugerida para la obra',' · Suggested for artwork') : '')} />)}
      </Select>)}
      {loading && <SkeletonText paragraph lineCount={3} />}
      {error && <p role="alert">{error}</p>}
      {error && <Button kind="tertiary" onClick={()=>setRetry(value=>value+1)}>{t('Reintentar','Retry')}</Button>}
      {current && !loading && variants.length===0 && !error && <p role="status">{t('No hay combinaciones verificadas para estas opciones. Cambia o borra la selección.','No verified combinations match these options. Change or clear the selection.')} {result.incompatibleOptions?.map(id=>options.find(row=>row.id===id)).filter(Boolean).map(row=>row.labels ? t(...row.labels) : row.title).join(' · ')}</p>}
      {current && variants.length>1 && <Select id="native-exact" labelText={t('Configuración disponible','Available configuration')} value={exact} onChange={event=>{setExact(event.target.value);setCost(null)}}>
        <SelectItem value="" text={t('Elegir combinación exacta','Choose exact combination')} />
        {variants.map((row,index)=><SelectItem key={studioVariantKey(row)} value={studioVariantKey(row)} text={Object.values(row.attributes).map(value=>t(...studioValue(value))).join(' · ') || `${t('Configuración','Configuration')} ${index+1}`} />)}
      </Select>}
      {variant && <details><summary>{t('Detalles técnicos del proveedor','Advanced supplier details')}</summary>
        <p>{t('Catálogo','Catalog')}: {group.catalogId}</p><p className={common.mono}>{variant.externalVariantId}</p><p>{Object.entries(variant.sourceAttributes || {}).map(([key,value])=>`${key}: ${value}`).join(' · ')}</p>
      </details>}
      {result?.technical && <details><summary>{t('Esquema técnico y reglas de la presentación','Technical schema and presentation rules')}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify({catalogId:group.catalogId,presentation:result.presentation,definitionVersion:result.schema.cache?.version,attributes:result.technical.attributes},null,2)}</pre></details>}
      {result?.schema.cache.stale && <p>{t('La definición guardada está vencida. El guardado requiere verificar datos actuales del proveedor.','The cached definition is expired. Saving requires current supplier verification.')}</p>}
      {result?.optionsScope==='current_variant_page' && <p>{t('Opciones de las variantes solicitadas. Prodigi no ofrece el mismo filtrado por atributos que Gelato.','Options from the requested variants. Prodigi does not offer Gelato’s attribute filtering.')}</p>}
      {!!result?.unresolved && <p>{t('Hay variantes sin combinaciones verificadas; no se pueden seleccionar.','Some variants lack verified combinations and cannot be selected.')}</p>}
      <div className={common.row}>
        {offset>0 && <Button kind="ghost" size="sm" disabled={loading} onClick={()=>{setOffset(Math.max(0,offset-25));setExact('')}}>{t('Anterior','Previous')}</Button>}
        {current && result.nextOffset!=null && result.nextOffset<=1000 && <Button kind="ghost" size="sm" disabled={loading} onClick={()=>{setOffset(result.nextOffset);setExact('')}}>{t('Siguiente','Next')}</Button>}
      </div>
      {result?.nextOffset>1000 && <p>{t('Refina los atributos para acotar la búsqueda.','Refine attributes to narrow the search.')}</p>}
      {result?.optionsScope==='matching_product_page' && <p>{t('Opciones verificadas en esta página de resultados. Usa Siguiente para consultar más tamaños; no se descarga el catálogo completo.','Options verified in this result page. Use Next for more sizes; the complete catalog is not downloaded.')}</p>}
      {group.provider==='gelato' && <Button kind="tertiary" disabled={!variant || !currency || loading} onClick={requestCost}>{t('Consultar costo de fabricación','Request manufacturing cost')}</Button>}
      {currentCost?.manufacturingMinor!=null && <p>{new Intl.NumberFormat(lang,{style:'currency',currency}).format(currentCost.manufacturingMinor/10**new Intl.NumberFormat(lang,{style:'currency',currency}).resolvedOptions().maximumFractionDigits)} · {t('Solo fabricación; envío e impuestos pendientes.','Manufacturing only; shipping and tax pending.')}</p>}
      {costError && <p role="status">{costError}</p>}
      {group.provider==='prodigi' && <p>{t('Costo sujeto a cotización con dirección.','Cost requires an address-based quote.')}</p>}
      <Button disabled={!variant || !current || loading || busy || !!error || atLimit || chosen} onClick={()=>onAdd({...variant,native:{selection,offset}},fit)}>
        {chosen ? t('Configuración agregada','Configuration added') : t('Agregar configuración','Add configuration')}</Button>
    </div>
  </div>
}
