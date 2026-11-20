'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Checkbox, ProgressIndicator, ProgressStep, Select, SelectItem, TextInput } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import OptimizedImg from '@/components/media/OptimizedImg'
import { CatalogFeedback, named } from '@/components/admin/productCatalog/CatalogFields'
import StudioEditorial, { studioProductContent } from '@/components/admin/productCatalog/StudioEditorial'
import SupplierCatalogBrowser from '@/components/admin/productCatalog/SupplierCatalogBrowser'
import StudioConfigurator from '@/components/admin/productCatalog/StudioConfigurator'
import { SHIPPING_COUNTRY_CODES } from '@/lib/shippingCountries'
import { studioVariantKey, studioValue, studioGroup,
  gelatoSeries, describeStudioVariant } from '@/lib/productCatalog/studioDiscovery'
import WallArtMockup from '@/components/admin/productCatalog/WallArtMockup'
import { callCatalog, useCatalog, useCatalogReads } from '@/components/admin/productCatalog/useCatalog'
import { wallArtFamilies, wallArtMoney } from '@/lib/productCatalog/wallArt'
import shared from '@/components/admin/productCatalog/ProductCatalog.module.css'
import styles from '@/components/admin/productCatalog/WallArtStudio.module.css'

const scenes = [['gallery','Galería','Gallery'], ['wall','Pared','Wall']]
const suppliers = {gelato:'Gelato',prodigi:'Prodigi'}

function amountMinor(value, currency) {
  return Math.round(Number(value) * 10 ** wallArtMoney(currency))
}

export default function UnifiedStudio({ initialProvider = 'all' }) {
  const { t, lang } = useI18n()
  const { run, busy, error } = useCatalog()
  const reads = useCatalogReads()
  const [step, setStep] = useState(0)
  const [artworks, setArtworks] = useState([])
  const [context, setContext] = useState(null)
  const [session, setSession] = useState(null)
  const [providerFilter,setProviderFilter] = useState(initialProvider)
  const [destination,setDestination] = useState('MX')
  const [sessions,setSessions] = useState([])
  const [currentGroup,setCurrentGroup] = useState(null)
  const [configurationPages,setConfigurationPages] = useState({})
  useEffect(()=>{
    let active=true
    const controller=new AbortController()
    callCatalog('listSessions',{}, {signal:controller.signal}).then(rows=>{ if(active)setSessions(rows) }).catch(()=>{})
    return ()=>{active=false;controller.abort()}
  },[])
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState([])
  const [editorial, setEditorial] = useState({})
  const [books, setBooks] = useState([])
  const [bookId, setBookId] = useState('')
  const [costs, setCosts] = useState({})
  const [prices, setPrices] = useState({})
  const [margin, setMargin] = useState('40')
  const [saved, setSaved] = useState(null)
  const editDraft = useRef({editorial:{},prices:{},margin:'40'})
  const [editorValid,setEditorValid] = useState(true)
  const recordEditorDraft = useCallback(next=>{editDraft.current=next},[])
  function navigate(next) {
    if(step===4){
      const draft=editDraft.current
      setEditorial(draft.editorial);setPrices(draft.prices);setMargin(draft.margin)
    }
    setStep(next);window.scrollTo(0,0)
  }
  const artwork = context?.artwork
  const activeBook = books.find(book => book.id === bookId)
  const displayNames = new Intl.DisplayNames([lang || 'es'], { type: 'region' })
  const labels = [t('Obra y destino','Artwork and destination'), t('Descubrimiento','Discovery'),
    t('Configuración','Configuration'), t('Mockups e imágenes','Mockups and images'),
    t('Descripciones y precios','Descriptions and pricing'), t('Revisar y guardar','Review and save')]
  const groups = useMemo(()=>[...selected.reduce((grouped, row) => {
    grouped.set(row.series, [...(grouped.get(row.series) || []), row])
    return grouped
  }, new Map())],[selected])
  const activeGroup = results?.groups.find(item=>item.id===currentGroup)
  const options = activeGroup ? configurationPages[activeGroup.id] : null
  const currencyLabel = (minor, currency) => new Intl.NumberFormat(lang, { style: 'currency', currency })
    .format(Number(minor) / 10 ** wallArtMoney(currency))

  async function initialize(workspace, artworkContext, country, rows = []) {
    reads.cancel()
    const read=reads.begin('workspace')
    const listed = await callCatalog('list',{}, {signal:read.signal})
    if(!read.current())return
    setContext(artworkContext)
    setSession(workspace)
    setDestination(country)
    const available=listed.books.filter(book=>book.country && ['active','draft'].includes(book.status))
    setBooks(available)
    setBookId(available.find(book=>book.country===country)?.id || '')
    setSelected(rows)
    setEditorial({})
    editDraft.current={editorial:{},prices:{},margin}
    setEditorValid(true)
    setResults(null)
    setPrices({})
    setCosts({})
    setConfigurationPages({})
    setStep(1)
    const enabled=workspace.criteria?.providers || Object.keys(suppliers)
    const supplier = providerFilter==='all' && enabled.length>1 ? 'all'
      : enabled.includes(providerFilter) ? providerFilter : enabled[0]
    setProviderFilter(supplier)
  }

  async function start(sourceAssetId) {
    const created=await callCatalog('createSession',{artworkId:artwork.id,sourceAssetId:sourceAssetId || undefined,
      providers:Object.keys(suppliers),countries:[destination],workflow:'wall_art'})
    await initialize(created,context,destination)
  }

  async function resume(id) {
    const restored=await callCatalog('resumeSession',{sessionId:id})
    if (!restored.session.artwork_id || restored.session.state==='archived') return
    const artworkContext=await callCatalog('artworkAssets',{artworkId:restored.session.artwork_id})
    const rows=restored.candidates.flatMap(candidate=>{
      if (candidate.product_discovery_selections?.length || candidate.compatibility?.status==='incompatible') return []
      const variant=candidate.provider_catalog_variants?.specification
      if (!variant || variant.combinations?.length) return []
      const item=candidate.catalog_snapshot?.groupKey ? {id:candidate.catalog_snapshot.groupKey,group:candidate.catalog_snapshot.family,provider:candidate.provider_code,externalId:candidate.external_id} : studioGroup(candidate.provider_code,{externalId:candidate.external_id,title:variant.title,variants:[variant]})
      if (!item) return []
      return [{...item,id:candidate.id,rowKey:candidate.id+':'+studioVariantKey(variant),series:item.id,
        variant:{...variant,attributes:{...(candidate.provider_code==='gelato'?gelatoSeries(candidate.external_id).attributes:{}),
          ...describeStudioVariant(variant)}},fit:'contain',scenes:['gallery'],primaryScene:'gallery'}]
    })
    await initialize(restored.session,artworkContext,restored.session.criteria?.countries?.[0] || destination,rows.slice(0,12))
  }

  async function inspect(group) {
    const read=reads.begin('variants:'+group.id)
    let offset=0
    const variants=[]
    let unresolved=0
    do {
      const response=await callCatalog('studioVariants',{provider:group.provider,externalId:group.externalId,
        groupKey:group.id,revision:group.revision,offset,country:destination},{signal:read.signal})
      if(!read.current())return
      variants.push(...response.variants)
      unresolved+=response.unresolved || 0
      offset=response.nextOffset
      setConfigurationPages(previous=>({...previous,[group.id]:{variants:[...variants],unresolved,partial:offset!=null}}))
    } while(offset!=null)
  }

  async function addConfiguration(group,variant,fit) {
    const candidate=await callCatalog('addCandidate',{sessionId:session.id,provider:group.provider,
      externalId:variant.externalId || group.externalId,variantId:variant.externalVariantId,
      category:variant.catalogId || group.catalogId || undefined,revision:group.revision,groupKey:group.id})
    const rowKey=candidate.id+':'+studioVariantKey(variant)
    setSelected(previous=>previous.some(row=>row.rowKey===rowKey) ? previous :
      [...previous,{...group,id:candidate.id,rowKey,variant,series:group.id,fit,scenes:['gallery'],primaryScene:'gallery'}])
  }

  function modify(id, fields) {
    setSelected(previous => previous.map(row => row.rowKey === id ? { ...row, ...fields } : row))
  }

  function changeScene(item, scene, checked) {
    const next = checked ? [...item.scenes, scene] : item.scenes.filter(value => value !== scene)
    if (!next.length) return
    modify(item.rowKey, { scenes: next, primaryScene: next.includes(item.primaryScene) ? item.primaryScene : next[0] })
  }

  function titleFor(item) {
    return item.titles ? item.titles[lang==='en' ? 1 : 0] : item.name || t(...wallArtFamilies[item.group])
  }

  function productContent(series, rows) {
    return studioProductContent(artwork,editorial,series,rows)
  }

  async function loadCosts() {
    const read=reads.begin('costs:'+bookId)
    const response = await callCatalog('wallArtCosts', { sessionId: session.id, candidateIds: [...new Set(selected.map(row => row.id))],
      country: activeBook.country, currency: activeBook.currency }, {signal:read.signal})
    if(!read.current())return
    setCosts(previous => ({ ...previous, [bookId]: Object.fromEntries(response.map(row => [row.candidateId, row])) }))
  }


  function submit() {
    run(async () => {
      const products = groups.map(([series, rows]) => {
        const { titleEs, titleEn, descriptionEs, descriptionEn } = productContent(series, rows)
        return { group: rows[0].group, titleEs, titleEn: titleEn || undefined, descriptionEs: descriptionEs || undefined,
          descriptionEn: descriptionEn || undefined, variants: rows.map(row => ({
            candidateId: row.id, configuration:row.variant.configuration, fit: row.fit, scenes: row.scenes, primaryScene: row.primaryScene,
            prices: books.flatMap(book => {
              const value = prices[book.id]?.[row.rowKey]
              return value == null || value === '' ? [] : [{ bookId: book.id, amountMinor: amountMinor(value, book.currency) }]
            }),
          })) }
      })
      setSaved(await callCatalog('saveWallArtDrafts', { sessionId: session.id, products }))
    })
  }

  const invalidPrices = books.some(book => selected.some(row => {
    const value = prices[book.id]?.[row.rowKey]
    const minor = amountMinor(value, book.currency)
    return value != null && value !== '' && (!Number.isSafeInteger(minor) || minor < 1 || minor > 999999999999)
  }))
  const invalidTitles = groups.some(([series, rows]) => !productContent(series, rows).titleEs.trim())
  const canContinue = step === 1 || step === 2 ? selected.length > 0 && groups.length <= 6
    : step === 4 ? editorValid : true

  return <div className={shared.shell}>
    <header>
      <h1>Product Studio</h1>
      <p>{t('Arte mural','Wall art')}</p>
    </header>
    <div className={styles.progress}><ProgressIndicator currentIndex={step} spaceEqually>{labels.map(label => <ProgressStep key={label} label={label} />)}</ProgressIndicator></div>
    <CatalogFeedback busy={busy} error={error} />
    {artwork && step > 0 && <p><strong>{lang === 'en' ? artwork.title_en || artwork.title : artwork.title}</strong> · {artwork.sku}</p>}

    {step === 0 && <section className={shared.section}>
      <h2>{t('Selecciona una obra','Choose an artwork')}</h2>
      <form className={styles.controls} onSubmit={event => {
        event.preventDefault()
        const query = named(event, 'query').trim()
        if (query) run(async () => setArtworks(await callCatalog('artworkSearch', { query })))
      }}>
        <TextInput id="wall-artwork-search" name="query" labelText={t('Título de la obra','Artwork title')} required />
        <Button type="submit" disabled={busy}>{t('Buscar obras','Find artworks')}</Button>
      </form>
      <div className={styles.cards}>{artworks.map(item => <button key={item.id} type="button"
        className={`${styles.card} ${artwork?.id === item.id ? styles.selected : ''}`}
        disabled={busy} onClick={() => run(async () => setContext(await callCatalog('artworkAssets',{ artworkId: item.id })))}>
        {item.primary_image_url && <OptimizedImg src={item.primary_image_url} className={styles.art} alt="" sizes="200px" />}
        <strong>{lang === 'en' ? item.title_en || item.title : item.title}</strong><span>{item.sku}</span>
      </button>)}</div>
      {artwork?.primary_image_url && <form className={styles.controls} onSubmit={event => {
        event.preventDefault()
        const asset = named(event, 'asset')
        if (session?.artwork_id === artwork.id && (session.source_asset_id || '') === asset && session.criteria?.countries?.[0] === destination) {
          setStep(1)
          return
        }
        run(() => start(asset))
      }}>
        <Select id="wall-art-asset" name="asset" labelText={t('Archivo de producción (opcional)','Production file (optional)')} defaultValue={session?.source_asset_id || ''}>
          <SelectItem value="" text={t('Usar imagen de la obra para las vistas previas','Use artwork image for previews')} />
          {context.assets.filter(asset => asset.asset_type === 'production_derivative').map(asset =>
            <SelectItem key={asset.id} value={asset.id} text={asset.width_px ? `${asset.width_px} × ${asset.height_px} px` : asset.id} />)}
        </Select>
        <Select id="studio-destination" labelText={t('País de entrega','Delivery country')}
          value={destination} onChange={event=>setDestination(event.target.value)}>
          {SHIPPING_COUNTRY_CODES.map(code=><SelectItem key={code} value={code} text={displayNames.of(code)} />)}
        </Select>
        <Button type="submit" disabled={busy}>{t('Elegir productos','Choose products')}</Button>
      </form>}
      {sessions.some(row=>row.artwork_id && row.state!=='archived' && row.state!=='drafted') && <details>
        <summary>{t('Continuar una sesión anterior','Resume a previous session')}</summary>
        <ul className={styles.summary}>{sessions.filter(row=>row.artwork_id && !['archived','drafted'].includes(row.state)).map(row=><li key={row.id}>
          <Button size="sm" kind="ghost" disabled={busy} onClick={()=>run(()=>resume(row.id))}>{row.artworks?.title || row.id}</Button>
        </li>)}</ul>
      </details>}
      {sessions.some(row=>row.wall_art_studio_saves?.product_ids?.length) && <details>
        <summary>{t('Borradores de sesiones anteriores','Drafts from previous sessions')}</summary>
        <ul className={styles.summary}>{sessions.flatMap(row=>(row.wall_art_studio_saves?.product_ids || []).map((id,index)=><li key={id}>
          <Link href={'/admin/products?id='+id}>{row.artworks?.title || t('Producto','Product')} · {index+1}</Link>
        </li>))}</ul>
      </details>}
      {artwork && !artwork.primary_image_url && <p>{t('Añade una imagen principal a esta obra para continuar.','Add a primary image to this artwork to continue.')}</p>}
    </section>}

    {session && <SupplierCatalogBrowser key={session.id} country={destination} providers={session.criteria?.providers || Object.keys(suppliers)}
      initialProvider={providerFilter} active={step===1} busy={busy} onConfigure={item=>{
        setResults({groups:[item]});setCurrentGroup(item.id);setStep(2);window.scrollTo(0,0)
        if(!configurationPages[item.id])run(()=>inspect(item))
      }} />}

    {step === 2 && <section className={shared.section}>
      <h2>{activeGroup ? titleFor(activeGroup) : t('Configuraciones seleccionadas','Selected configurations')}</h2>
      {activeGroup && <StudioConfigurator key={activeGroup.id} group={{...activeGroup,variants:options?.variants || activeGroup.variants}}
        image={artwork.primary_image_url} busy={busy} selected={selected} country={destination} currency={activeBook?.currency}
        onAdd={(variant,fit)=>run(()=>addConfiguration(activeGroup,variant,fit))}
        partial={!options || options.partial} unresolved={options?.unresolved || 0}
        onRetry={()=>run(()=>inspect(activeGroup))} />}
      <h3>{t('Selección de esta sesión','Session selection')} · {selected.length}/12</h3>
      <ul className={styles.summary}>{selected.map(item=><li key={item.rowKey}>
        {titleFor(item)} · {Object.values(item.variant.attributes).map(value=>t(...studioValue(value))).join(' · ')}
        <Button size="sm" kind="ghost" disabled={busy} onClick={()=>setSelected(previous=>previous.filter(row=>row.rowKey!==item.rowKey))}>
          {t('Quitar','Remove')}</Button>
      </li>)}</ul>
    </section>}

    {step === 3 && <section className={shared.section}>
      <h2>{t('Mockups e imágenes comerciales','Mockups and commercial images')}</h2>
      <p>{t('Las imágenes comerciales verificadas se cargan por variante en Product Manager después de guardar.','Upload verified commercial images by variant in Product Manager after saving.')}</p>
      <p>{t('Vistas previas de JBU. Revisa el encuadre antes de preparar el archivo de producción.','JBU previews. Review the crop before preparing the production file.')}</p>
      {selected.map(item => {
        const asset = context.assets.find(row => row.id === session.source_asset_id)
        const dpi = asset?.width_px && asset.height_px && item.variant.widthMm && item.variant.heightMm
          ? Math.floor(25.4 * Math.min(asset.width_px / item.variant.widthMm, asset.height_px / item.variant.heightMm)) : null
        return <article className={shared.item} key={item.rowKey}>
          <h3>{titleFor(item)}</h3>
          <p>{dpi == null ? t('Resolución de producción por confirmar','Production resolution to confirm')
            : t(`${dpi} ppp estimados antes del sangrado`,`Estimated ${dpi} dpi before bleed`)}
            {dpi != null && dpi < 240 && ' · ' + t('Revisar resolución','Review resolution')}</p>
          <div className={styles.controls}>
            <Select id={'fit-' + encodeURIComponent(item.rowKey)} labelText={t('Encuadre','Fit')} value={item.fit} onChange={event => modify(item.rowKey,{ fit:event.target.value })}>
              <SelectItem value="contain" text={t('Ajustar imagen completa','Fit whole image')} />
              <SelectItem value="cover" text={t('Rellenar con recorte','Fill with crop')} />
            </Select>
            <Select id={'primary-' + encodeURIComponent(item.rowKey)} labelText={t('Imagen principal','Primary image')} value={item.primaryScene} onChange={event => modify(item.rowKey,{ primaryScene:event.target.value })}>
              {scenes.filter(([code]) => item.scenes.includes(code)).map(([code, es, en]) => <SelectItem key={code} value={code} text={t(es,en)} />)}
            </Select>
          </div>
          <div className={styles.cards}>{scenes.map(([scene,es,en]) => <div className={styles.card} key={scene}>
            <WallArtMockup image={artwork.primary_image_url} alt={artwork.title} variant={item.variant} fit={item.fit} scene={scene} framed={['framed_print','framed_canvas'].includes(item.group)} />
            <Checkbox id={scene + '-' + encodeURIComponent(item.rowKey)} labelText={t(es,en)} checked={item.scenes.includes(scene)}
              disabled={item.scenes.length === 1 && item.scenes.includes(scene)}
              onChange={(_event, { checked }) => changeScene(item,scene,checked)} />
          </div>)}</div>
        </article>
      })}
    </section>}

    {step === 4 && <StudioEditorial key={session.id} artwork={artwork} groups={groups} selected={selected}
      books={books} bookId={bookId} onBookChange={setBookId} costs={costs} busy={busy}
      onLoadCosts={()=>run(loadCosts)} initialDraft={{editorial,prices,margin}}
      onDraftChange={recordEditorDraft} onValidityChange={setEditorValid} />}

    {step === 5 && <section className={shared.section}>
      <h2>{saved ? t('Borradores guardados','Drafts saved') : t('Revisa los borradores','Review drafts')}</h2>
      {groups.map(([series,rows], index) => <article className={shared.item} key={series}>
        <h3>{productContent(series,rows).titleEs}</h3>
        <p>{productContent(series,rows).descriptionEs}</p>
        <ul className={styles.summary}>{rows.map(item => <li key={item.rowKey}>{titleFor(item)} · {item.scenes.length} {t('mockups','mockups')} · {
          books.map(book => {
            const price = prices[book.id]?.[item.rowKey]
            return price ? `${book.country} ${currencyLabel(amountMinor(price,book.currency),book.currency)}` : null
          }).filter(Boolean).join(' · ') || t('Sin precio','No price')
        }</li>)}</ul>
        {saved?.[index] && <Link href={'/admin/products?id=' + saved[index]}>{t('Abrir producto','Open product')}</Link>}
      </article>)}
    </section>}

    {step > 0 && !saved && <div className={styles.actions}>
      <Button type="button" kind="ghost" disabled={busy} onClick={() => navigate(step - 1)}>{t('Atrás','Back')}</Button>
      {step < 5 ? <Button type="button" disabled={busy || !canContinue} onClick={() => navigate(step + 1)}>{t('Continuar','Continue')}</Button>
        : <Button type="button" disabled={busy || invalidPrices || invalidTitles} onClick={submit}>{t('Guardar borradores','Save drafts')}</Button>}
    </div>}
  </div>
}
