'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {Select,SelectItem,Tag,Button,TextInput} from '@carbon/react'
import {useI18n} from '@/components/I18nProvider'
import {callCatalog} from './useCatalog'
import {studioValue} from '@/lib/productCatalog/studioDiscovery'
import OptimizedImg from '@/components/media/OptimizedImg'
import {productionAssetLabels} from './CatalogFields'
import {fineArtCurrencies} from '@/lib/productCatalog/commerce'
import {proposedWallArtPrice} from '@/lib/productCatalog/wallArt'
import {mockupVariant} from '@/lib/productCatalog/configuration'
import WallArtMockup from './WallArtMockup'
import styles from './ProductCatalog.module.css'
import layout from './ProductOverview.module.css'

export default function ProductOverview({detail,books=[],families=[],requirementLabels={},onRequirement,onMarketEnabled}) {
  const {t,lang}=useI18n()
  const [country,setCountry]=useState(detail.studioSaves?.[0]?.product_discovery_sessions?.criteria?.countries?.[0] || '')
  const [quotes,setQuotes]=useState({})
  const [marketQuotes,setMarketQuotes]=useState({})
  const [marketBookId,setMarketBookId]=useState('')
  const [margin,setMargin]=useState('40')
  const [appliedMargin,setAppliedMargin]=useState(null)
  const [progress,setProgress]=useState(null)
  const [marketError,setMarketError]=useState('')
  const [marketBusy,setMarketBusy]=useState(false)
  const [clock,setClock]=useState(()=>Date.now())
  const hasQuotes=Object.keys(marketQuotes).length>0
  useEffect(()=>{
    if (!hasQuotes) return
    const timer=setInterval(()=>setClock(Date.now()),5000)
    return ()=>clearInterval(timer)
  },[hasQuotes])
  const countries=[...new Set(books.map(book=>book.country).filter(Boolean))]
  const names=new Intl.DisplayNames([lang || 'es'],{type:'region'})
  const issues=detail.handoffIssues || []
  const artwork=detail.artworks[0]?.artworks
  const source=detail.studioSaves?.[0]?.product_discovery_sessions
  const family=families.find(row=>row.code===detail.product.family_code)
  const statusLabels={draft:['Borrador','Draft'],published:['Publicado','Published'],pending_review:['En revisión','In review'],approved:['Aprobado','Approved'],archived:['Archivado','Archived']}
  const image=detail.variants.flatMap(row=>row.product_variant_assets || []).find(asset=>asset.role==='gallery' && asset.is_primary && asset.art_assets?.public_url)
  const mockupRow=detail.variants.find(row=>row.default_commercial_mockup) || detail.variants.find(row=>row.wall_art_mockups?.source_url)
  const mockup=mockupRow?.wall_art_mockups
  const currency=books.find(book=>book.country===country)?.currency
  const marketBooks=books.filter(book=>book.country===country && (!book.channel || book.channel==='storefront') &&
    !book.segment && ['active','draft'].includes(book.status) && fineArtCurrencies.includes(book.currency) &&
    !(Date.parse(book.valid_from)>clock || Date.parse(book.valid_to)<=clock))
  const marketBook=marketBooks.find(book=>book.id===marketBookId) || marketBooks.find(book=>book.status==='active') || marketBooks[0]
  const additional=detail.product.status==='published' && detail.studioSaves?.length>0
    ? detail.variants.filter(row=>row.status==='active' && row.allowed_countries?.length && !row.allowed_countries.includes(country) &&
      row.provider_product_mappings?.some(mapping=>mapping.provider_code==='gelato')) : []
  const currentQuotes=marketQuotes[marketBook?.id] || {}
  const amountFor=quote=>quote?.status==='quoted' && Date.parse(quote.expiresAt)>clock && appliedMargin!=null
    ? proposedWallArtPrice(Number(quote.manufacturingMinor)+Number(quote.shippingMinor),appliedMargin) : null
  const money=amount=>new Intl.NumberFormat(lang,{style:'currency',currency:marketBook.currency}).format(Number(amount)/100)
  const ready=additional.flatMap(row=>{
    const quote=currentQuotes[row.id]
    const amountMinor=amountFor(quote)
    return amountMinor>0 && amountMinor<=99999999 ? [{variantId:row.id,quoteId:quote.quoteId,amountMinor}] : []
  })

  async function marketAction(enable) {
    const items=enable ? ready : additional.filter(row=>{
      const quote=currentQuotes[row.id]
      return quote?.status!=='quoted' || Date.parse(quote.expiresAt)<=clock
    }).map(row=>row.id)
    const bookId=marketBook.id
    const productId=detail.product.id
    setClock(Date.now());setMarketBusy(true);setMarketError('');setProgress([0,items.length])
    let saved=false
    try {
      for(let i=0;i<items.length;i+=12) {
        const batch=items.slice(i,i+12)
        const results=await callCatalog(enable ? 'enableStudioMarket' : 'quoteStudioMarket',enable
          ? {productId,bookId,rows:batch,confirm:true} : {productId,bookId,variantIds:batch})
        saved ||= results.some(row=>row.priceEntryId)
        setMarketQuotes(previous=>{
          const market={...previous[bookId]}
          for(const row of results) market[row.variantId]=enable ? {...market[row.variantId],saveError:row.error} : row
          return {...previous,[bookId]:market}
        })
        setProgress([Math.min(i+batch.length,items.length),items.length])
      }
    } catch(error) {setMarketError(error.code || 'catalog_unavailable')}
    finally {
      try {if(saved) await onMarketEnabled?.()}
      catch {setMarketError('catalog_unavailable')}
      finally {setMarketBusy(false)}
    }
  }
  const errors={
    market_quote_invalid_or_expired:['Cotización vencida o modificada. Vuelve a cotizar.','The quote expired or changed. Request a new quote.'],
    market_shipping_not_configured:['Configura el envío de JBU para este destino.','Configure JBU shipping for this destination.'],
    market_activate_book_separately:['Activa esta lista desde Libros de precios.','Activate this book from Price Books.'],
    market_price_book_conflict:['Existe un precio vigente en otra lista de prioridad igual o mayor.','A current price exists in another book of equal or higher priority.'],
    overlapping_price_entry:['Ya existe un precio activo para esta variante en la lista.','An active price already exists for this variant in this book.'],
    market_already_enabled:['El destino ya está habilitado. Actualiza el producto.','This destination is already enabled. Refresh the product.'],
  }
  const errorLabel=code=>t(...(errors[code] || ['No se pudo guardar o cargar el mercado.','The market could not be saved or loaded.']))+' ('+code+')'

  async function quoteCost(row,mapping) {
    const key=row.id+'|'+country
    setQuotes(previous=>({...previous,[key]:{loading:true}}))
    try {const value=await callCatalog('studioVariantCost',{provider:'gelato',variantId:mapping.external_variant_id,country,currency});setQuotes(previous=>({...previous,[key]:value}))}
    catch {setQuotes(previous=>({...previous,[key]:{error:true}}))}
  }
  const rows=detail.variants.map(row=>{
    const allowed=!country || !row.allowed_countries?.length || row.allowed_countries.includes(country)
    const entries=row.price_book_entries.filter(entry=>books.some(book=>book.id===entry.price_book_id && book.country===country && ['draft','active'].includes(book.status)))
      .filter(entry=>(!entry.valid_from || Date.parse(entry.valid_from)<=clock) && (!entry.valid_to || Date.parse(entry.valid_to)>clock))
    const price=entries.find(entry=>entry.status==='active') || entries.find(entry=>entry.status==='draft')
    const book=price && books.find(book=>book.id===price.price_book_id)
    const quote=quotes[row.id+'|'+country]
    const marketQuote=currentQuotes[row.id]
    const marketPrice=amountFor(marketQuote)
    const mapping=row.provider_product_mappings?.find(mapping=>mapping.provider_code==='gelato')
    const problems=detail.readiness?.[row.id]
    const candidate=detail.selections?.find(selection=>selection.product_variant_id===row.id)?.product_discovery_candidates
    const supplierSku=candidate?.catalog_snapshot?.variant?.sku || candidate?.provider_catalog_variants?.external_sku
    const dimensions=row.wall_art_mockups?.width_mm && row.wall_art_mockups?.height_mm
      ? row.wall_art_mockups.width_mm+' × '+row.wall_art_mockups.height_mm+' mm' : null
    const label=row.product_variant_attribute_values.filter(attribute=>!['state','productstatus','productmodel','variable','colortype'].includes(attribute.attribute_code.replaceAll('_','').toLowerCase())).map(attribute=>attribute.text_value ?? attribute.enum_value ?? attribute.number_value).filter(value=>value!=null).map(value=>t(...studioValue(String(value)))).join(' · ') || row.title || t('Configuración estándar','Standard configuration')
    return {id:row.id,title:label,sku:supplierSku || row.sku,provider:[...new Set(row.provider_product_mappings?.map(mapping=>mapping.provider_code))].map(name=>name[0].toUpperCase()+name.slice(1)).join(', ') || t('Manual','Manual'),
      price:!country ? t('Selecciona un destino para revisar precios','Select a destination to review prices') : !allowed ? t('Destino no habilitado para esta variante','Destination not enabled for this variant') : price && book ? new Intl.NumberFormat(lang,{style:'currency',currency:book.currency}).format(Number(price.amount_minor)/10**new Intl.NumberFormat(lang,{style:'currency',currency:book.currency}).resolvedOptions().maximumFractionDigits)+' · '+price.status : t('Precio pendiente de revisión','Price requires review'),
      marketCost:marketQuote?.status==='quoted' ? <>
        <p>{t('Fabricación','Manufacturing')}: {money(marketQuote.manufacturingMinor)} · {t('Envío','Shipping')}: {money(marketQuote.shippingMinor)}</p>
        {marketPrice!=null && <p>{t('Precio propuesto','Proposed price')}: {money(marketPrice)}</p>}
        {marketQuote.saveError && <p role="status">{errorLabel(marketQuote.saveError)}</p>}
        {Date.parse(marketQuote.expiresAt)<=clock && <p>{t('Cotización vencida','Quote expired')}</p>}
      </> : marketQuote?.status==='unavailable' ? <p>{t('Producto no disponible con Gelato para el destino','Product unavailable from Gelato for this destination')}</p>
        : marketQuote?.status==='unconfigured' ? <p>{t('Asignación de Gelato sin configurar','Gelato mapping is not configured')}</p>
        : marketQuote?.status==='quote_failed' ? <p>{t('Fallo temporal de cotización. Reintenta.','Temporary quote failure. Retry.')}</p> : null,
      production:<>{detail.productionAssets?.[row.id] === 'linked' && <p>{t(...productionAssetLabels.linked)}</p>}<p>{quote?.manufacturingMinor!=null ? t('Fabricación','Manufacturing')+': '+new Intl.NumberFormat(lang,{style:'currency',currency:quote.currency}).format(quote.manufacturingMinor/10**new Intl.NumberFormat(lang,{style:'currency',currency:quote.currency}).resolvedOptions().maximumFractionDigits) : quote?.error ? t('No se pudo confirmar la cotización. Puedes reintentar.','Quotation could not be confirmed. You can retry.') : t('Cotización pendiente','Quotation pending')}</p>
        {mapping && <Button kind="ghost" size="sm" disabled={!country || !currency || quote?.loading} onClick={()=>quoteCost(row,mapping)}>{t('Consultar fabricación','Request manufacturing cost')}</Button>}
        <p>{row.provider_product_mappings?.some(mapping=>mapping.enabled && mapping.validation_status==='validated') ? t('Asignación validada','Mapping validated') : t('Validación de producción pendiente; no impide publicar si cumple los requisitos comerciales.','Production validation pending; publication is allowed when commercial requirements are met.')}</p>
        {row.artwork_print_id && <Link href={'/admin/prints?variant='+encodeURIComponent(row.artwork_print_id)}>
          {t('Abrir Artwork Print y cargar maestro','Open Artwork Print and upload master')}</Link>}</>,
      readiness:problems?.length ? <ul>{problems.map(code=>{
        const section={ image:'image',price:'price',price_mx:'price',provider_mapping:'production' }[code]
        const id=section && section+'-'+row.id
        const message=code==='production_asset' && artwork
          ? t(...(productionAssetLabels[detail.productionAssets?.[row.id]] || requirementLabels.production_asset || [code,code]))+' '+artwork.sku+' · '+(dimensions || label)
          : t(...(requirementLabels[code] || [code,code]))
        return <li key={code}>{id ? <a href={'#'+id} onClick={onRequirement ? event=>onRequirement(event,id) : undefined}>{message}</a>
          : code==='production_asset' && artwork ? <Link href={'/admin/prints?artwork='+encodeURIComponent(artwork.id)}>{message}</Link> : message}</li>
      })}</ul> : problems ? t('Requisitos objetivos completos; conserva las aprobaciones necesarias.','Objective requirements complete; required approvals still apply.') : t('Revisión pendiente','Review pending')}
  })
  return <section className={styles.section} aria-label={t('Resumen del producto configurable','Configurable product overview')}>
    <h3>{t('Resumen comercial','Commercial overview')}</h3>
    <div className={styles.row}><Tag>{statusLabels[detail.product.status] ? t(...statusLabels[detail.product.status]) : detail.product.status}</Tag><Tag>{family ? t(family.label_es,family.label_en) : detail.product.family_code.replaceAll('_',' ')}</Tag><Tag>{detail.variants.length} {t('variantes','variants')}</Tag></div>
    {artwork ? <p>{t('Obra o versión de origen','Source artwork or version')}: <Link href={'/admin/artworks/'+artwork.id+'/edit'}>{artwork.title} · {artwork.sku}</Link>
      {(artwork.version_kind || source?.criteria?.sourceArtwork?.versionKind) && ' · '+t('Versión seleccionada conservada','Selected version preserved')}</p> : <p>{t('Borrador sin obra vinculada','Unlinked draft')}</p>}
    {detail.originals?.map(row=><p key={row.id}>{t('Obra original','Original artwork')}: <Link href={'/admin/artworks/'+row.id+'/edit'}>{row.title} · {row.sku}</Link></p>)}
    {image ? <div className={layout.preview}><OptimizedImg src={image.art_assets.public_url} alt={t(image.alt_es,image.alt_en) || detail.product.title_es} sizes="288px" /><p>{t('Imagen comercial registrada; consulta los requisitos de aprobación.','Recorded commercial image; check approval requirements.')}</p></div> : mockup && <div className={layout.preview}><WallArtMockup image={mockup.source_url} alt="" variant={mockupVariant(mockupRow)} framed={['framed_print','framed_canvas'].includes(detail.product.family_code)} fit={mockup.fit} borderMm={mockup.border_mm} /><p>{mockupRow.default_commercial_mockup ? t('Mockup de JBU asociado como imagen comercial principal.','JBU mockup assigned as the primary commercial image.') : t('Vista ilustrativa de JBU; imagen comercial pendiente de aprobación.','Illustrative JBU preview; commercial image approval pending.')}</p></div>}
    {issues.length>0 && <p role="alert">{t('La creación desde Studio tiene relaciones incompletas; requiere corregirlas antes de publicar.','Studio creation has incomplete relationships; repair is required before publication.')}</p>}
    {source && <p>{source.source_asset_id ? t('Archivo de producción seleccionado conservado.','Selected production file preserved.') : t('Vista previa conservada. Maestro pendiente de validar para producción; no impide publicar.','Preview preserved. Master validation is pending for production; publication is allowed.')}</p>}
    <Select id="product-overview-country" labelText={t('Destino para revisar precios','Destination for price review')} value={country} disabled={marketBusy} onChange={event=>{setCountry(event.target.value);setProgress(null);setMarketError('')}}>
      <SelectItem value="" text={t('Seleccionar destino','Select destination')} />{countries.map(code=><SelectItem key={code} value={code} text={names.of(code)} />)}
    </Select>
    {country && additional.length>0 && <div className={styles.row}>
      {marketBook ? <>
        {marketBooks.length>1 && <Select id="studio-market-book" labelText={t('Lista de precios','Price book')}
          value={marketBook.id} disabled={marketBusy} onChange={event=>setMarketBookId(event.target.value)}>
          {marketBooks.map(book=><SelectItem key={book.id} value={book.id} text={book.name+' · '+book.currency} />)}
        </Select>}
        <Button kind="tertiary" size="sm" disabled={marketBusy} onClick={()=>marketAction(false)}>
          {t('Cotizar fabricación y envío','Quote manufacturing and shipping')}
        </Button>
        <TextInput id="studio-market-margin" type="number" min="0" max="99.99" value={margin}
          labelText={t('Margen objetivo (%)','Target margin (%)')} disabled={marketBusy}
          onChange={event=>{setMargin(event.target.value);setAppliedMargin(null)}} />
        <Button kind="tertiary" size="sm" disabled={marketBusy || margin==='' || !(Number(margin)>=0 && Number(margin)<100) ||
          !Object.values(currentQuotes).some(quote=>quote.status==='quoted' && Date.parse(quote.expiresAt)>clock)}
          onClick={()=>setAppliedMargin(Number(margin))}>{t('Aplicar margen','Apply margin')}</Button>
        <Button size="sm" disabled={marketBusy || !ready.length} onClick={()=>marketAction(true)}>
          {marketBook.status==='draft' ? t('Activar lista y habilitar destino','Activate price book and enable destination')
            : t('Guardar precios y habilitar destino','Save prices and enable destination')} ({ready.length})
        </Button>
      </> : <p>{t('Configura una lista de precios MXN o USD para este destino.','Configure an MXN or USD price book for this destination.')}</p>}
    </div>}
    {progress && <p role="status">{progress.join(' / ')} {t('variantes procesadas','variants processed')}</p>}
    {marketError && <p role="alert">{errorLabel(marketError)}</p>}
    <div className={layout.table}><table><caption>{t('Variantes comerciales y requisitos','Commercial variants and requirements')}</caption><thead><tr>{[t('Configuración','Configuration'),'SKU',t('Proveedor','Provider'),t('Precio por destino','Destination price'),t('Producción','Production'),t('Publicación','Publication')].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}><th scope="row">{row.title}</th><td>{row.sku}</td><td>{row.provider}</td><td>{row.price}{row.marketCost}</td><td>{row.production}</td><td>{row.readiness}</td></tr>)}</tbody></table></div>
    <div className={layout.cards}>{rows.map(row=><article key={row.id}><h4>{row.title}</h4><p>SKU: {row.sku} · {row.provider}</p><p>{row.price}</p>{row.marketCost}{row.production}<div>{row.readiness}</div></article>)}</div>
    <p>{t('Un borrador guardado no equivale a producción lista. Las imágenes, precios y publicación conservan sus aprobaciones.','A saved draft does not establish production readiness. Image, price and publication approvals remain required.')}</p>
    <details><summary>{t('Proveniencia y relaciones técnicas','Provenance and technical relationships')}</summary><pre className={layout.technical}>{JSON.stringify({issues,studio:detail.studioSaves,selections:detail.selections,mappings:detail.variants.flatMap(row=>row.provider_product_mappings || [])},null,2)}</pre></details>
  </section>
}


