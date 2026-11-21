'use client'
import {useState} from 'react'
import Link from 'next/link'
import {Select,SelectItem,Tag,Button} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {callCatalog} from './useCatalog'
import {studioValue} from '@/lib/productCatalog/studioDiscovery'
import OptimizedImg from '@/components/media/OptimizedImg'
import WallArtMockup from './WallArtMockup'
import styles from './ProductCatalog.module.css'
import layout from './ProductOverview.module.css'

export default function ProductOverview({detail,books=[],families=[],requirementLabels={}}) {
  const {t,lang}=useI18n()
  const [country,setCountry]=useState(detail.studioSaves?.[0]?.product_discovery_sessions?.criteria?.countries?.[0] || '')
  const [quotes,setQuotes]=useState({})
  const countries=[...new Set(books.map(book=>book.country).filter(Boolean))]
  const names=new Intl.DisplayNames([lang || 'es'],{type:'region'})
  const issues=detail.handoffIssues || []
  const artwork=detail.artworks[0]?.artworks
  const source=detail.studioSaves?.[0]?.product_discovery_sessions
  const family=families.find(row=>row.code===detail.product.family_code)
  const statusLabels={draft:['Borrador','Draft'],published:['Publicado','Published'],pending_review:['En revisión','In review'],approved:['Aprobado','Approved'],archived:['Archivado','Archived']}
  const image=detail.variants.flatMap(row=>row.product_variant_assets || []).find(asset=>asset.role==='gallery' && asset.is_primary && asset.art_assets?.public_url)
  const mockup=detail.variants.find(row=>row.wall_art_mockups?.source_url)?.wall_art_mockups
  const currency=books.find(book=>book.country===country)?.currency
  async function quoteCost(row,mapping) {
    const key=row.id+'|'+country
    setQuotes(previous=>({...previous,[key]:{loading:true}}))
    try {const value=await callCatalog('studioVariantCost',{provider:'gelato',variantId:mapping.external_variant_id,country,currency});setQuotes(previous=>({...previous,[key]:value}))}
    catch {setQuotes(previous=>({...previous,[key]:{error:true}}))}
  }
  const rows=detail.variants.map(row=>{
    const allowed=!country || !row.allowed_countries?.length || row.allowed_countries.includes(country)
    const entries=row.price_book_entries.filter(entry=>books.some(book=>book.id===entry.price_book_id && book.country===country && ['draft','active'].includes(book.status)))
      .filter(entry=>(!entry.valid_from || Date.parse(entry.valid_from)<=Date.now()) && (!entry.valid_to || Date.parse(entry.valid_to)>Date.now()))
    const price=entries.find(entry=>entry.status==='active') || entries.find(entry=>entry.status==='draft')
    const book=price && books.find(book=>book.id===price.price_book_id)
    const quote=quotes[row.id+'|'+country]
    const mapping=row.provider_product_mappings?.find(mapping=>mapping.provider_code==='gelato')
    const problems=detail.readiness?.[row.id]
    const label=row.product_variant_attribute_values.filter(attribute=>!['state','productstatus','productmodel','variable','colortype'].includes(attribute.attribute_code.replaceAll('_','').toLowerCase())).map(attribute=>attribute.text_value ?? attribute.enum_value ?? attribute.number_value).filter(value=>value!=null).map(value=>t(...studioValue(String(value)))).join(' · ') || row.title || t('Configuración estándar','Standard configuration')
    return {id:row.id,title:label,sku:row.sku,provider:[...new Set(row.provider_product_mappings?.map(mapping=>mapping.provider_code))].map(name=>name[0].toUpperCase()+name.slice(1)).join(', ') || t('Manual','Manual'),
      price:!country ? t('Selecciona un destino para revisar precios','Select a destination to review prices') : !allowed ? t('Destino no habilitado para esta variante','Destination not enabled for this variant') : price && book ? new Intl.NumberFormat(lang,{style:'currency',currency:book.currency}).format(Number(price.amount_minor)/10**new Intl.NumberFormat(lang,{style:'currency',currency:book.currency}).resolvedOptions().maximumFractionDigits)+' · '+price.status : t('Precio pendiente de revisión','Price requires review'),
      production:<><p>{quote?.manufacturingMinor!=null ? t('Fabricación','Manufacturing')+': '+new Intl.NumberFormat(lang,{style:'currency',currency:quote.currency}).format(quote.manufacturingMinor/10**new Intl.NumberFormat(lang,{style:'currency',currency:quote.currency}).resolvedOptions().maximumFractionDigits) : quote?.error ? t('No se pudo confirmar la cotización. Puedes reintentar.','Quotation could not be confirmed. You can retry.') : t('Cotización pendiente','Quotation pending')}</p>
        {mapping && <Button kind="ghost" size="sm" disabled={!country || !currency || quote?.loading} onClick={()=>quoteCost(row,mapping)}>{t('Consultar fabricación','Request manufacturing cost')}</Button>}
        <p>{row.provider_product_mappings?.some(mapping=>mapping.enabled && mapping.validation_status==='validated') ? t('Asignación validada','Mapping validated') : t('Falta validar archivo, proveedor y destinos','File, supplier and destinations require validation')}</p></>,
      readiness:problems?.length ? <ul>{problems.map(code=><li key={code}>{requirementLabels[code] ? t(...requirementLabels[code]) : t('Requiere revisión comercial','Commercial review required')}</li>)}</ul> : problems ? t('Requisitos objetivos completos; conserva las aprobaciones necesarias.','Objective requirements complete; required approvals still apply.') : t('Revisión pendiente','Review pending')}
  })
  return <section className={styles.section} aria-label={t('Resumen del producto configurable','Configurable product overview')}>
    <h3>{t('Resumen comercial','Commercial overview')}</h3>
    <div className={styles.row}><Tag>{statusLabels[detail.product.status] ? t(...statusLabels[detail.product.status]) : detail.product.status}</Tag><Tag>{family ? t(family.label_es,family.label_en) : detail.product.family_code.replaceAll('_',' ')}</Tag><Tag>{detail.variants.length} {t('variantes','variants')}</Tag></div>
    {artwork ? <p>{t('Obra o versión de origen','Source artwork or version')}: <Link href={'/admin/artworks/'+artwork.id+'/edit'}>{artwork.title} · {artwork.sku}</Link>
      {(artwork.version_kind || source?.criteria?.sourceArtwork?.versionKind) && ' · '+t('Versión seleccionada conservada','Selected version preserved')}</p> : <p>{t('Borrador sin obra vinculada','Unlinked draft')}</p>}
    {detail.originals?.map(row=><p key={row.id}>{t('Obra original','Original artwork')}: <Link href={'/admin/artworks/'+row.id+'/edit'}>{row.title} · {row.sku}</Link></p>)}
    {image ? <div className={layout.preview}><OptimizedImg src={image.art_assets.public_url} alt={t(image.alt_es,image.alt_en) || detail.product.title_es} sizes="288px" /><p>{t('Imagen comercial registrada; consulta los requisitos de aprobación.','Recorded commercial image; check approval requirements.')}</p></div> : mockup && <div className={layout.preview}><WallArtMockup image={mockup.source_url} alt="" variant={{widthMm:mockup.width_mm,heightMm:mockup.height_mm}} fit={mockup.fit} /><p>{t('Vista ilustrativa de JBU; imagen comercial pendiente de aprobación.','Illustrative JBU preview; commercial image approval pending.')}</p></div>}
    {issues.length>0 && <p role="alert">{t('La creación desde Studio tiene relaciones incompletas; requiere corregirlas antes de publicar.','Studio creation has incomplete relationships; repair is required before publication.')}</p>}
    {source && <p>{source.source_asset_id ? t('Archivo de producción seleccionado conservado.','Selected production file preserved.') : t('Vista previa de la obra conservada; falta validar el archivo de producción.','Artwork preview preserved; production file validation pending.')}</p>}
    <Select id="product-overview-country" labelText={t('Destino para revisar precios','Destination for price review')} value={country} onChange={event=>setCountry(event.target.value)}>
      <SelectItem value="" text={t('Seleccionar destino','Select destination')} />{countries.map(code=><SelectItem key={code} value={code} text={names.of(code)} />)}
    </Select>
    <div className={layout.table}><table><caption>{t('Variantes comerciales y requisitos','Commercial variants and requirements')}</caption><thead><tr>{[t('Configuración','Configuration'),'SKU',t('Proveedor','Provider'),t('Precio por destino','Destination price'),t('Producción','Production'),t('Publicación','Publication')].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.title}</th><td>{row.sku}</td><td>{row.provider}</td><td>{row.price}</td><td>{row.production}</td><td>{row.readiness}</td></tr>)}</tbody></table></div>
    <div className={layout.cards}>{rows.map(row=><article key={row.id}><h4>{row.title}</h4><p>SKU: {row.sku} · {row.provider}</p><p>{row.price}</p>{row.production}<div>{row.readiness}</div></article>)}</div>
    <p>{t('Un borrador guardado no equivale a producción lista. Las imágenes, precios y publicación conservan sus aprobaciones.','A saved draft does not establish production readiness. Image, price and publication approvals remain required.')}</p>
    <details><summary>{t('Proveniencia y relaciones técnicas','Provenance and technical relationships')}</summary><pre className={layout.technical}>{JSON.stringify({issues,studio:detail.studioSaves,selections:detail.selections,mappings:detail.variants.flatMap(row=>row.provider_product_mappings || [])},null,2)}</pre></details>
  </section>
}
