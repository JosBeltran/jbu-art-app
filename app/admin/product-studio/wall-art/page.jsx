'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Checkbox, ProgressIndicator, ProgressStep, Select, SelectItem, TextArea, TextInput } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import OptimizedImg from '@/components/media/OptimizedImg'
import { CatalogFeedback, named } from '@/components/admin/productCatalog/CatalogFields'
import WallArtMockup from '@/components/admin/productCatalog/WallArtMockup'
import { callCatalog, useCatalog } from '@/components/admin/productCatalog/useCatalog'
import { proposedWallArtPrice, wallArtFamilies, wallArtMoney } from '@/lib/productCatalog/wallArt'
import shared from '@/components/admin/productCatalog/ProductCatalog.module.css'
import styles from '@/components/admin/productCatalog/WallArtStudio.module.css'

const pageSize = 25
const maxVariants = 12
const scenes = [['gallery','Galería','Gallery'], ['wall','Pared','Wall']]

function productSeries(item) {
  return item.externalId.toLowerCase()
    .replace(/(?:^|[_-])(?:pf|size)?[_-]?\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?(?:-?mm|-?cm|-?inch|in)?(?=[_-]|$)/g, '')
    .replace(/[_-](?:hor|ver|vertical|horizontal|portrait|landscape)(?=[_-]|$)/g, '')
}

function amountMinor(value, currency) {
  return Math.round(Number(value) * 10 ** wallArtMoney(currency))
}

export default function WallArtStudio() {
  const { t, lang } = useI18n()
  const { run, busy, error } = useCatalog()
  const [step, setStep] = useState(0)
  const [artworks, setArtworks] = useState([])
  const [context, setContext] = useState(null)
  const [session, setSession] = useState(null)
  const [catalogs, setCatalogs] = useState([])
  const [catalog, setCatalog] = useState('posters')
  const [groupFilter, setGroupFilter] = useState('')
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState([])
  const [editorial, setEditorial] = useState({})
  const [books, setBooks] = useState([])
  const [bookId, setBookId] = useState('')
  const [costs, setCosts] = useState({})
  const [prices, setPrices] = useState({})
  const [margin, setMargin] = useState('40')
  const [saved, setSaved] = useState(null)
  const artwork = context?.artwork
  const activeBook = books.find(book => book.id === bookId)
  const language = lang === 'en' ? 1 : 0
  const displayNames = new Intl.DisplayNames([lang || 'es'], { type: 'region' })
  const labels = [t('Obra','Artwork'), t('Productos','Products'), t('Mockups','Mockups'),
    t('Descripciones','Descriptions'), t('Precios','Prices'), t('Revisar','Review')]
  const groups = [...selected.reduce((grouped, row) => {
    grouped.set(row.series, [...(grouped.get(row.series) || []), row])
    return grouped
  }, new Map())]
  const visibleItems = results?.items.filter(item => !groupFilter || item.group === groupFilter)
  const currencyLabel = (minor, currency) => new Intl.NumberFormat(lang, { style: 'currency', currency })
    .format(Number(minor) / 10 ** wallArtMoney(currency))

  async function search(offset = 0, query = '', catalogId = catalog) {
    const result = await callCatalog('wallArtSearch', { catalogId, query: query || undefined, offset, limit: pageSize })
    setResults({ ...result, offset, query })
  }

  async function start(sourceAssetId) {
    const [created, listed] = await Promise.all([
      callCatalog('createSession', { artworkId: artwork.id, sourceAssetId: sourceAssetId || undefined,
        providers: ['gelato'], countries: [], workflow: 'wall_art' }),
      callCatalog('list'),
    ])
    setSession(created)
    const available = listed.books.filter(book => book.country && ['active','draft'].includes(book.status))
    setBooks(available)
    setBookId(available.find(book => book.country === 'MX')?.id || available[0]?.id || '')
    setSelected([])
    setGroupFilter('')
    setEditorial({})
    setResults(null)
    setPrices({})
    setCosts({})
    setStep(1)
    await loadCatalogs()
  }

  async function loadCatalogs() {
    const all = await callCatalog('wallArtCatalogs')
    setCatalogs(all)
    const first = all.find(item => item.id === catalog) || all.find(item => /wall.?art|posters/i.test(item.id))
    if (first) {
      setCatalog(first.id)
      await search(0, '', first.id)
    }
  }

  function toggle(item, checked) {
    if (!checked) {
      setSelected(previous => previous.filter(row => row.externalId !== item.externalId))
      return
    }
    run(async () => {
      const candidate = await callCatalog('addCandidate', { sessionId: session.id, provider: 'gelato',
        externalId: item.externalId, variantId: item.externalId, category: item.category })
      const variant = item.variants[0]
      setSelected(previous => [...previous, { ...item, variant, id: candidate.id, series: productSeries(item),
        fit: 'contain', scenes: ['gallery'], primaryScene: 'gallery' }])
    })
  }

  function modify(id, fields) {
    setSelected(previous => previous.map(row => row.id === id ? { ...row, ...fields } : row))
  }

  function changeScene(item, scene, checked) {
    const next = checked ? [...item.scenes, scene] : item.scenes.filter(value => value !== scene)
    if (!next.length) return
    modify(item.id, { scenes: next, primaryScene: next.includes(item.primaryScene) ? item.primaryScene : next[0] })
  }

  function titleFor(item) {
    return item.title === item.externalId ? item.title.replace(/[_-]/g, ' ') : item.title
  }

  function productContent(series, rows) {
    const item = rows[0]
    const category = wallArtFamilies[item.group]
    const attributes = item.variant.attributes || {}
    const material = [attributes.PaperType, attributes.Material, attributes.CanvasType].find(value => typeof value === 'string')
    const dimensions = rows.map(row => row.variant.widthMm && row.variant.heightMm
      ? `${row.variant.widthMm} × ${row.variant.heightMm} mm` : null).filter(Boolean).join(', ')
    return editorial[series] || {
      titleEs: (artwork.title + ' · ' + category[0]).slice(0,240),
      titleEn: ((artwork.title_en || artwork.title) + ' · ' + category[1]).slice(0,240),
      descriptionEs: ('Reproducción bajo pedido de «' + artwork.title + '».' +
        (material ? ' Material: ' + material.replaceAll('-', ' ') + '.' : '') +
        (dimensions ? ' Formatos: ' + dimensions + '.' : '')).slice(0,4000),
      descriptionEn: ('Made-to-order reproduction of “' + (artwork.title_en || artwork.title) + '”.' +
        (material ? ' Material: ' + material.replaceAll('-', ' ') + '.' : '') +
        (dimensions ? ' Sizes: ' + dimensions + '.' : '')).slice(0,4000),
    }
  }

  async function loadCosts() {
    const response = await callCatalog('wallArtCosts', { sessionId: session.id, candidateIds: selected.map(row => row.id),
      country: activeBook.country, currency: activeBook.currency })
    setCosts(previous => ({ ...previous, [bookId]: Object.fromEntries(response.map(row => [row.candidateId, row])) }))
  }

  function applyMargin() {
    setPrices(previous => {
      const market = { ...previous[bookId] }
      for (const row of selected) {
        const proposed = proposedWallArtPrice(costs[bookId]?.[row.id]?.manufacturingMinor, Number(margin))
        if (proposed != null) market[row.id] = String(proposed / 10 ** wallArtMoney(activeBook.currency))
      }
      return { ...previous, [bookId]: market }
    })
  }

  function submit() {
    run(async () => {
      const products = groups.map(([series, rows]) => {
        const { titleEs, titleEn, descriptionEs, descriptionEn } = productContent(series, rows)
        return { group: rows[0].group, titleEs, titleEn: titleEn || undefined, descriptionEs: descriptionEs || undefined,
          descriptionEn: descriptionEn || undefined, variants: rows.map(row => ({
            candidateId: row.id, fit: row.fit, scenes: row.scenes, primaryScene: row.primaryScene,
            prices: books.flatMap(book => {
              const value = prices[book.id]?.[row.id]
              return value == null || value === '' ? [] : [{ bookId: book.id, amountMinor: amountMinor(value, book.currency) }]
            }),
          })) }
      })
      setSaved(await callCatalog('saveWallArtDrafts', { sessionId: session.id, products }))
    })
  }

  const invalidPrices = books.some(book => selected.some(row => {
    const value = prices[book.id]?.[row.id]
    const minor = amountMinor(value, book.currency)
    return value != null && value !== '' && (!Number.isSafeInteger(minor) || minor < 1 || minor > 999999999999)
  }))
  const invalidTitles = groups.some(([series, rows]) => !productContent(series, rows).titleEs.trim())
  const canContinue = step === 1 ? selected.length > 0 && groups.length <= 6
    : step === 3 ? !invalidTitles : step === 4 ? !invalidPrices : true

  return <div className={shared.shell}>
    <header>
      <h1>{t('Arte mural con Gelato','Wall art with Gelato')}</h1>
      <Link href="/admin/product-studio">{t('Volver a Product Studio','Back to Product Studio')}</Link>
    </header>
    <ProgressIndicator currentIndex={step} spaceEqually>{labels.map(label => <ProgressStep key={label} label={label} />)}</ProgressIndicator>
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
        if (session?.artwork_id === artwork.id && (session.source_asset_id || '') === asset) {
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
        <Button type="submit" disabled={busy}>{t('Elegir productos','Choose products')}</Button>
      </form>}
      {artwork && !artwork.primary_image_url && <p>{t('Añade una imagen principal a esta obra para continuar.','Add a primary image to this artwork to continue.')}</p>}
    </section>}

    {step === 1 && <section className={shared.section}>
      <h2>{t('Selecciona productos de arte mural','Choose wall art products')}</h2>
      <form className={styles.controls} onSubmit={event => {
        event.preventDefault()
        const query = named(event,'query').trim()
        run(() => search(0, query))
      }}>
        {catalogs.length ? <Select id="wall-catalog" labelText={t('Catálogo de Gelato','Gelato catalog')} value={catalog}
          onChange={event => {
            const id = event.target.value
            setCatalog(id)
            setResults(null)
            if (id) run(() => search(0, '', id))
          }}>
          <SelectItem value="" text={t('Seleccionar','Select')} />
          {catalogs.map(item => <SelectItem key={item.id} value={item.id} text={item.title} />)}
        </Select> : <TextInput id="wall-catalog-id" labelText={t('Identificador de catálogo de Gelato','Gelato catalog ID')} value={catalog}
          onChange={event => { setCatalog(event.target.value); setResults(null) }} placeholder="posters" />}
        <Select id="wall-family" labelText={t('Tipo de arte mural','Wall art type')} value={groupFilter}
          onChange={event => setGroupFilter(event.target.value)}>
          <SelectItem value="" text={t('Todos','All')} />
          {Object.entries(wallArtFamilies).map(([code,label]) => <SelectItem key={code} value={code} text={label[language]} />)}
        </Select>
        <TextInput id="wall-search" name="query" labelText={t('Término de búsqueda','Search term')} />
        <Button type="submit" disabled={busy || !catalog.trim()}>{t('Buscar productos','Find products')}</Button>
        {!catalogs.length && <Button type="button" kind="tertiary" disabled={busy} onClick={() => run(loadCatalogs)}>{t('Cargar catálogos','Load catalogs')}</Button>}
      </form>
      <p role="status">{selected.length}/{maxVariants} {t('variantes seleccionadas','selected variants')} · {groups.length}/6 {t('productos','products')}</p>
      {results && !visibleItems.length && <p>{t('No hay productos de arte mural en esta página.','There are no wall art products on this page.')}</p>}
      <div className={styles.cards}>{visibleItems?.map(item => {
        const checked = selected.some(row => row.externalId === item.externalId)
        const variant = item.variants[0]
        return <article key={item.externalId} className={`${styles.card} ${checked ? styles.selected : ''}`}>
          <WallArtMockup image={artwork.primary_image_url} alt="" variant={variant} fit="contain" />
          <p>{wallArtFamilies[item.group][language]}{variant.widthMm && variant.heightMm ? ` · ${variant.widthMm} × ${variant.heightMm} mm` : ''}</p>
          <Checkbox id={'wall-option-' + item.externalId} labelText={titleFor(item)} checked={checked}
            disabled={busy || (!checked && (selected.length >= maxVariants || (groups.length >= 6 && !groups.some(([key]) => key === productSeries(item)))))}
            onChange={(_event, { checked }) => toggle(item, checked)} />
        </article>
      })}</div>
      {results && <nav className={shared.row} aria-label={t('Páginas de resultados','Result pages')}>
        {results.offset > 0 && <Button kind="ghost" disabled={busy} onClick={() => run(() => search(Math.max(0, results.offset - pageSize), results.query))}>{t('Anterior','Previous')}</Button>}
        <span>{t('Página','Page')} {Math.floor(results.offset / pageSize) + 1}</span>
        {results.nextOffset != null && <Button kind="ghost" disabled={busy} onClick={() => run(() => search(results.nextOffset, results.query))}>{t('Siguiente','Next')}</Button>}
      </nav>}
      {selected.length > 0 && <details><summary>{t('Ver selección','View selection')}</summary>
        <ul className={styles.summary}>{selected.map(item => <li key={item.id}>{titleFor(item)} <Button size="sm" kind="ghost" disabled={busy} onClick={() => toggle(item, false)}>{t('Quitar','Remove')}</Button></li>)}</ul>
      </details>}
    </section>}

    {step === 2 && <section className={shared.section}>
      <h2>{t('Elige los mockups','Choose mockups')}</h2>
      <p>{t('Vistas previas de JBU. Revisa el encuadre antes de preparar el archivo de producción.','JBU previews. Review the crop before preparing the production file.')}</p>
      {selected.map(item => {
        const asset = context.assets.find(row => row.id === session.source_asset_id)
        const dpi = asset?.width_px && asset.height_px && item.variant.widthMm && item.variant.heightMm
          ? Math.floor(25.4 * Math.min(asset.width_px / item.variant.widthMm, asset.height_px / item.variant.heightMm)) : null
        return <article className={shared.item} key={item.id}>
          <h3>{titleFor(item)}</h3>
          <p>{dpi == null ? t('Resolución de producción por confirmar','Production resolution to confirm')
            : t(`${dpi} ppp estimados antes del sangrado`,`Estimated ${dpi} dpi before bleed`)}
            {dpi != null && dpi < 240 && ' · ' + t('Revisar resolución','Review resolution')}</p>
          <div className={styles.controls}>
            <Select id={'fit-' + item.id} labelText={t('Encuadre','Fit')} value={item.fit} onChange={event => modify(item.id,{ fit:event.target.value })}>
              <SelectItem value="contain" text={t('Ajustar imagen completa','Fit whole image')} />
              <SelectItem value="cover" text={t('Rellenar con recorte','Fill with crop')} />
            </Select>
            <Select id={'primary-' + item.id} labelText={t('Imagen principal','Primary image')} value={item.primaryScene} onChange={event => modify(item.id,{ primaryScene:event.target.value })}>
              {scenes.filter(([code]) => item.scenes.includes(code)).map(([code, es, en]) => <SelectItem key={code} value={code} text={t(es,en)} />)}
            </Select>
          </div>
          <div className={styles.cards}>{scenes.map(([scene,es,en]) => <div className={styles.card} key={scene}>
            <WallArtMockup image={artwork.primary_image_url} alt={artwork.title} variant={item.variant} fit={item.fit} scene={scene} />
            <Checkbox id={scene + '-' + item.id} labelText={t(es,en)} checked={item.scenes.includes(scene)}
              disabled={item.scenes.length === 1 && item.scenes.includes(scene)}
              onChange={(_event, { checked }) => changeScene(item,scene,checked)} />
          </div>)}</div>
        </article>
      })}
    </section>}

    {step === 3 && <section className={shared.section}>
      <h2>{t('Edita títulos y descripciones','Edit titles and descriptions')}</h2>
      {groups.map(([series,rows]) => {
        const content = productContent(series,rows)
        const update = (key, value) => setEditorial(previous => ({ ...previous, [series]: { ...content, [key]: value } }))
        return <article className={shared.item} key={series}>
          <p>{titleFor(rows[0])} · {rows.length} {t('variantes','variants')}</p>
          <FieldPair label={t('Título','Title')} series={series} content={content} update={update} field="title" input={TextInput} />
          <FieldPair label={t('Descripción','Description')} series={series} content={content} update={update} field="description" input={TextArea} />
        </article>
      })}
    </section>}

    {step === 4 && <section className={shared.section}>
      <h2>{t('Precios por mercado','Market prices')}</h2>
      <p>{t('El margen se calcula sobre fabricación. Envío e impuestos quedan por confirmar. Puedes guardar sin precio.','Margin uses manufacturing cost. Shipping and tax are pending. You can save without a price.')}</p>
      <div className={styles.controls}>
        <Select id="wall-price-book" labelText={t('País de entrega y moneda','Destination country and currency')} value={bookId} onChange={event => setBookId(event.target.value)}>
          {!books.length && <SelectItem value="" text={t('Sin listas de precios','No price books')} />}
          {books.map(book => <SelectItem key={book.id} value={book.id} text={`${displayNames.of(book.country)} · ${book.currency} · ${book.name}`} />)}
        </Select>
        <Button type="button" disabled={busy || !activeBook} onClick={() => run(loadCosts)}>{t('Consultar costos','Get costs')}</Button>
        <TextInput id="wall-margin" labelText={t('Margen de fabricación (%)','Manufacturing margin (%)')} min="0" max="99" type="number" value={margin}
          onChange={event => setMargin(event.target.value)} />
        <Button type="button" kind="tertiary" disabled={busy || !costs[bookId] || margin === '' || Number(margin) < 0 || Number(margin) >= 100}
          onClick={applyMargin}>{t('Aplicar margen','Apply margin')}</Button>
      </div>
      {activeBook && <div className={styles.table}><table>
        <thead><tr><th>{t('Variante','Variant')}</th><th>{t('Fabricación','Manufacturing')}</th><th>{t('Envío','Shipping')}</th>
          <th>{t('Precio de venta','Retail price')}</th><th>{t('Margen de fabricación','Manufacturing margin')}</th></tr></thead>
        <tbody>{selected.map(item => {
          const cost = costs[bookId]?.[item.id]
          const value = prices[bookId]?.[item.id] ?? ''
          const retail = amountMinor(value, activeBook.currency)
          const profit = retail > 0 && cost?.manufacturingMinor != null ? Math.round(100 * (retail - cost.manufacturingMinor) / retail) : null
          return <tr key={item.id}>
            <td>{titleFor(item)}</td>
            <td>{cost?.manufacturingMinor != null ? currencyLabel(cost.manufacturingMinor,activeBook.currency)
              : cost ? t('Sin costo verificable','Cost unavailable') : '—'}</td>
            <td>{t('Por confirmar','Pending')}</td>
            <td><TextInput id={'wall-price-' + item.id} labelText={t('Precio de venta','Retail price') + ' · ' + titleFor(item)}
              hideLabel type="number" min={1 / 10 ** wallArtMoney(activeBook.currency)} step={1 / 10 ** wallArtMoney(activeBook.currency)}
              value={value} onChange={event => {
                const amount = event.target.value
                setPrices(previous => ({ ...previous, [bookId]: { ...previous[bookId],[item.id]:amount } }))
              }} /></td>
            <td>{profit == null ? '—' : profit + '%'}</td>
          </tr>
        })}</tbody>
      </table></div>}
    </section>}

    {step === 5 && <section className={shared.section}>
      <h2>{saved ? t('Borradores guardados','Drafts saved') : t('Revisa los borradores','Review drafts')}</h2>
      {groups.map(([series,rows], index) => <article className={shared.item} key={series}>
        <h3>{productContent(series,rows).titleEs}</h3>
        <p>{productContent(series,rows).descriptionEs}</p>
        <ul className={styles.summary}>{rows.map(item => <li key={item.id}>{titleFor(item)} · {item.scenes.length} {t('mockups','mockups')} · {
          books.map(book => {
            const price = prices[book.id]?.[item.id]
            return price ? `${book.country} ${currencyLabel(amountMinor(price,book.currency),book.currency)}` : null
          }).filter(Boolean).join(' · ') || t('Sin precio','No price')
        }</li>)}</ul>
        {saved?.[index] && <Link href={'/admin/products?id=' + saved[index]}>{t('Abrir producto','Open product')}</Link>}
      </article>)}
    </section>}

    {step > 0 && !saved && <div className={styles.actions}>
      <Button type="button" kind="ghost" disabled={busy} onClick={() => setStep(step - 1)}>{t('Atrás','Back')}</Button>
      {step < 5 ? <Button type="button" disabled={busy || !canContinue} onClick={() => { setStep(step + 1); window.scrollTo(0,0) }}>{t('Continuar','Continue')}</Button>
        : <Button type="button" disabled={busy || invalidPrices || invalidTitles} onClick={submit}>{t('Guardar borradores','Save drafts')}</Button>}
    </div>}
  </div>
}

function FieldPair({ field, series, label, content, update, input: Input }) {
  return <div className={shared.cols}>{['Es','En'].map(language => {
    const key = field + language
    return <Input key={key} id={key + '-' + series} labelText={label + ' · ' + language.toUpperCase()} value={content[key]}
      maxLength={field === 'title' ? 240 : 4000} onChange={event => update(key,event.target.value)} />
  })}</div>
}
