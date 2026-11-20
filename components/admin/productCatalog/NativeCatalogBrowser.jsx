'use client'
import {useEffect,useState} from 'react'
import {Button,Select,SelectItem,SkeletonText,TextInput,Tag} from '@carbon/react'
import {Image as ImageIcon} from '@carbon/icons-react'
import {useI18n} from '@/components/I18nProvider'
import {callCatalog} from './useCatalog'
import common from './ProductCatalog.module.css'
import styles from './SupplierCatalogBrowser.module.css'

export default function NativeCatalogBrowser({active,providers,initialProvider,country,busy,onConfigure}) {
  const {t,lang}=useI18n()
  const [provider,setProvider]=useState(providers.includes(initialProvider) ? initialProvider : providers[0])
  const [offset,setOffset]=useState(0)
  const [category,setCategory]=useState('')
  const [query,setQuery]=useState('')
  const [result,setResult]=useState(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [retry,setRetry]=useState(0)
  useEffect(()=>{
    if(!active)return
    const abort=new AbortController()
    const timer=setTimeout(()=>{
      setLoading(true);setError('')
      callCatalog('nativeDiscover',{provider,category:category || undefined,country,offset},{signal:abort.signal}).then(data=>{if(!abort.signal.aborted)setResult({...data,provider,offset,category})})
        .catch(err=>{if(err.name!=='AbortError')setError(err.code==='provider_rate_limited' ? t('El proveedor limitó las consultas. Reintenta más tarde.','Supplier rate limit reached. Retry later.') : t('No se pudo leer el catálogo del proveedor. Puedes reintentar.','Unable to read the supplier catalog. You can retry.'))})
        .finally(()=>{if(!abort.signal.aborted)setLoading(false)})
    },0)
    return ()=>{clearTimeout(timer);abort.abort()}
  },[active,provider,category,country,offset,retry,t])
  const current=result?.provider===provider && result.offset===offset && result.category===category
  const items=current ? result.presentations.filter(item=>item.titles.join(' ').toLowerCase().includes(query.toLowerCase())) : []
  if(!active)return null
  return <section className={common.section}>
    <h2>{t('Proveedor, categoría y presentación','Supplier, category and presentation')}</h2>
    <p>{t('Elige una categoría para ver presentaciones comerciales verificadas con el proveedor.','Choose a category to see commercial presentations verified against supplier results.')}</p>
    <div className={styles.filters}>
      <Select id="native-provider" labelText={t('Proveedor','Supplier')} value={provider} onChange={event=>{setProvider(event.target.value);setOffset(0);setCategory('')}}>
        {providers.map(value=><SelectItem key={value} value={value} text={value==='gelato' ? 'Gelato' : 'Prodigi'} />)}
      </Select>
      <Select id="native-category" labelText={t('Categoría','Category')} value={category} onChange={event=>{setCategory(event.target.value);setOffset(0)}}>
        <SelectItem value="" text={t('Elegir categoría','Choose category')} />
        {(result?.provider===provider ? result.categories || [] : []).map(item=><SelectItem key={item.id} value={item.id} text={item.titles[lang==='en'?1:0]} />)}
      </Select>
      <TextInput id="native-presentation-search" labelText={t('Buscar presentación','Search presentations')} value={query} onChange={event=>setQuery(event.target.value)} />
    </div>
    {current && result.cache?.stale && <p role="status">{t('Metadatos guardados temporalmente. La disponibilidad se verifica al resolver la configuración.','Showing saved metadata temporarily. Availability is checked when resolving the configuration.')}</p>}
    {error && <p role="alert">{error}</p>}
    {error && <Button kind="tertiary" onClick={()=>setRetry(value=>value+1)}>{t('Reintentar','Retry')}</Button>}
    <div className={styles.cards} aria-busy={loading}>
      {loading ? <SkeletonText paragraph lineCount={4} /> : !current ? null : items.map(item=><article className={styles.card} key={item.id}>
        <div className={styles.placeholder}><ImageIcon size={32} aria-hidden="true" /><span>{t('Fotografía autorizada no disponible','Authorized photograph unavailable')}</span></div>
        <Tag>{provider==='gelato' ? 'Gelato' : 'Prodigi'}</Tag><h3>{item.titles[lang==='en'?1:0]}</h3>
        <p>{item.description?.[lang==='en'?1:0]}</p>
        <p>{t('Tamaños verificados en esta consulta','Sizes verified in this result')}: {item.sizeSummary?.length ? item.sizeSummary.join(' · ') : t('Consultar configuración','See configuration')}</p>
        <Button size="sm" disabled={busy || loading} onClick={()=>onConfigure(item)}>{t('Configurar presentación','Configure presentation')}</Button>
      </article>)}
    </div>
    {category && current && !loading && !items.length && !error && <p>{t('No hay presentaciones verificadas en los resultados consultados. No se mostrarán variantes de otras familias.','No verified presentations in the requested results. Variants from other families will not be shown.')}</p>}
    {provider==='prodigi' && <nav className={common.row} aria-label={t('Productos del proveedor','Supplier products')}>
      {offset>0 && <Button kind="ghost" disabled={loading} onClick={()=>setOffset(Math.max(0,offset-5))}>{t('Anterior','Previous')}</Button>}
      {current && result.nextOffset!=null && result.nextOffset<=1000 && <Button kind="ghost" disabled={loading} onClick={()=>setOffset(result.nextOffset)}>{t('Siguiente','Next')}</Button>}
    </nav>}
  </section>
}
