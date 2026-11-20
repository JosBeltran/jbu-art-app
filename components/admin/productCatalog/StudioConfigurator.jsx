'use client'
import { useEffect, useState } from 'react'
import { Button, Select, SelectItem } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { matchingStudioVariants, studioValue, studioVariantKey } from '@/lib/productCatalog/studioDiscovery'
import { studioCapabilities } from '@/lib/productCatalog/studioDiscovery'
import { wallArtMoney } from '@/lib/productCatalog/wallArt'
import { callCatalog } from './useCatalog'
import WallArtMockup from './WallArtMockup'
import common from './ProductCatalog.module.css'

const labels = {
  size:['Tamaño','Size'],orientation:['Orientación','Orientation'],paper:['Papel','Paper'],
  material:['Material','Material'],finish:['Acabado','Finish'],frame_material:['Material del marco','Frame material'],
  frame_color:['Color del marco','Frame color'],glazing:['Cubierta','Glazing'],mount:['Paspartú','Mount'],
}

export default function StudioConfigurator({ group, image, busy, selected, onAdd, onRetry, partial, unresolved=0, country, currency }) {
  const { t, lang } = useI18n()
  const [choice,setChoice] = useState({})
  const [exact,setExact] = useState('')
  const [fit,setFit] = useState('contain')
  const [cost,setCost] = useState(null)
  const keys = [...new Set(group.variants.flatMap(variant=>Object.keys(variant.attributes)))]
  const order=Object.keys(labels)
  keys.sort((a,b)=>(order.includes(a) ? order.indexOf(a) : order.length)-(order.includes(b) ? order.indexOf(b) : order.length))
  const available = matchingStudioVariants(group.variants,choice)
  const variant = available.find(row=>studioVariantKey(row)===exact) || (available.length===1 ? available[0] : null)
  const variantId=variant?.externalVariantId
  const provider=group.provider
  const offersCost=studioCapabilities[provider].destinationPricing
  useEffect(()=>{
    if (!variantId || !offersCost || !currency) return
    let active=true
    const controller=new AbortController()
    const wait=setTimeout(()=>{
      callCatalog('studioVariantCost',{provider,variantId,country,currency},{signal:controller.signal})
        .then(result=>{ if(active)setCost({variantId,country,currency,amount:result.manufacturingMinor}) })
        .catch(()=>{ if(active)setCost({variantId,country,currency,amount:null}) })
    },300)
    return ()=>{active=false;clearTimeout(wait);controller.abort()}
  },[variantId,country,currency,offersCost,provider])
  const currentCost=cost && cost.variantId===variantId && cost.country===country && cost.currency===currency ? cost : null
  const chosen = variant && selected.some(row=>row.series===group.id && studioVariantKey(row.variant)===studioVariantKey(variant))
  const atLimit = selected.length >= 12 || (new Set(selected.map(row=>row.series)).size >= 6 && !selected.some(row=>row.series===group.id))
  return <div className={common.cols}>
    <div>
      <WallArtMockup image={image} alt="" variant={variant || available[0]} fit={fit} framed={['framed_print','framed_canvas'].includes(group.group)} />
      <p>{t('Vista aproximada de JBU','Approximate JBU preview')}</p>
    </div>
    <div className={common.fields}>
      <Select id="studio-config-fit" labelText={t('Encuadre','Framing')} value={fit} onChange={event=>setFit(event.target.value)}>
        <SelectItem value="contain" text={t('Ajustar','Fit')} />
        <SelectItem value="cover" text={t('Rellenar','Fill')} />
      </Select>
      {keys.map((key,index)=>{
        const preceding=Object.fromEntries(keys.slice(0,index).map(name=>[name,choice[name]]))
        const possible=matchingStudioVariants(group.variants,preceding)
        const values=[...new Set(possible.map(row=>row.attributes[key]).filter(Boolean))]
        if (!values.length) return null
        return <Select key={key} id={'studio-configuration-'+key} labelText={t(...(labels[key] || studioValue(key)))}
          value={choice[key] || ''} onChange={event=>{
            setChoice({...preceding,[key]:event.target.value})
            setExact('')
          }}>
          <SelectItem value="" text={t('Seleccionar','Select')} />
          {values.map(value=><SelectItem key={value} value={value} text={t(...studioValue(value))} />)}
        </Select>
      })}
      {available.length>1 && <Select id="studio-exact-configuration" labelText={t('Combinación disponible','Available combination')}
        value={exact} onChange={event=>setExact(event.target.value)}>
        <SelectItem value="" text={t('Seleccionar','Select')} />
        {available.map((row,index)=><SelectItem key={studioVariantKey(row)} value={studioVariantKey(row)}
          text={Object.values(row.attributes).map(value=>t(...studioValue(value))).join(' · ') || t('Configuración','Configuration')+' '+(index+1)} />)}
      </Select>}
      {!available.length && <p>{t('No hay combinaciones disponibles en los resultados consultados.','No combinations are available in the loaded results.')}</p>}
      {variant && <details><summary>{t('Identificador del proveedor','Supplier identifier')}</summary><p className={common.mono}>{variant.sku}</p></details>}
      {variant && <p aria-live="polite">{currentCost?.amount != null
        ? t('Fabricación estimada','Estimated manufacturing')+' · '+new Intl.NumberFormat(lang,{style:'currency',currency})
          .format(currentCost.amount/10**wallArtMoney(currency))
        : !offersCost ? t('Costo sujeto a cotización con dirección','Cost requires an address-based quote')
          : !currency ? t('Configura una lista de precios para este mercado','Configure a price book for this market')
            : currentCost ? t('Costo de fabricación sin confirmar','Manufacturing cost unconfirmed')
              : t('Consultando costo de fabricación…','Checking manufacturing cost…')}</p>}
      <Button disabled={!variant || busy || partial || chosen || atLimit} onClick={()=>onAdd(variant,fit)}>
        {chosen ? t('Configuración agregada','Configuration added') : t('Agregar configuración','Add configuration')}</Button>
      {unresolved>0 && <p role="status">{unresolved} {t('variantes requieren verificar las combinaciones con el proveedor y no se pueden seleccionar.','variants require supplier combination verification and cannot be selected.')}</p>}
      {partial && <p role="status">{t('Cargando las opciones de la revisión guardada. La selección se habilita al terminar.','Loading the stored revision’s options. Selection becomes available when complete.')}</p>}
      {partial && !busy && <Button kind="tertiary" size="sm" onClick={onRetry}>{t('Reintentar lectura de opciones','Retry reading options')}</Button>}
    </div>
  </div>
}
