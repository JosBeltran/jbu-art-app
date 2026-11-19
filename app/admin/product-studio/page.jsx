'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, ProgressIndicator, ProgressStep, Select, SelectItem, TextInput, Tag } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { callCatalog, useCatalog } from '@/components/admin/productCatalog/useCatalog'
import { CatalogFeedback, DraftForm, named } from '@/components/admin/productCatalog/CatalogFields'
import OptimizedImg from '@/components/media/OptimizedImg'
import styles from '@/components/admin/productCatalog/ProductCatalog.module.css'

const providerNames = { gelato: 'Gelato', prodigi: 'Prodigi' }

export default function ProductStudio() {
  const { t, lang } = useI18n()
  const { run, busy, error } = useCatalog()
  const [step, setStep] = useState(0)
  const [options, setOptions] = useState(null)
  const [artworks, setArtworks] = useState([])
  const [artworkContext, setArtworkContext] = useState(null)
  const [sessions, setSessions] = useState([])
  const [active, setActive] = useState(null)
  const [search, setSearch] = useState(null)
  const [inspected, setInspected] = useState(null)
  const [categories, setCategories] = useState([])
  const [candidate, setCandidate] = useState(null)
  const [quote, setQuote] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [draft, setDraft] = useState(null)
  const [savedPrice, setSavedPrice] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([callCatalog('list'), callCatalog('listSessions')]).then(([config, existing]) => {
      if (active) { setOptions(config); setSessions(existing) }
    }).catch(() => {})
    return () => { active = false }
  }, [])

  async function resume(sessionId) {
    const result = await callCatalog('resumeSession', { sessionId })
    setActive(result)
    const context = result.session.artwork_id ? await callCatalog('artworkAssets', { artworkId: result.session.artwork_id }) : null
    setArtworkContext(context)
    setCandidate(null)
    setSearch(null)
    setInspected(null)
    setQuote(null)
    setProposal(null)
    setDraft(null)
    setStep(1)
  }

  async function catalogSearch(input) {
    const result = await callCatalog('searchCatalog', input)
    setSearch({ ...result, input })
    setInspected(null)
  }

  async function saveCandidate(variantId) {
    const row = await callCatalog('addCandidate', { sessionId: active.session.id, provider: search.input.provider,
      externalId: inspected.externalId, variantId, category: search.input.category, offset: inspected.offset })
    const refreshed = await callCatalog('resumeSession', { sessionId: active.session.id })
    setActive(refreshed)
    openCandidate(refreshed.candidates.find(candidate => candidate.id === row.id))
  }

  function openCandidate(row) {
    setCandidate(row)
    setQuote(row.provider_quotes?.find(quote => Date.parse(quote.expires_at) > Date.now()) || null)
    setProposal(null)
    setDraft(null)
    setSavedPrice(false)
    setStep(2)
  }

  function formValue(event, name) { return named(event, name) || undefined }
  const artwork = artworkContext?.artwork
  const candidateSpec = candidate?.provider_catalog_variants?.specification
  const steps = [
    t('Obra y destino', 'Artwork and market'), t('Catálogo de proveedor', 'Supplier catalog'),
    t('Configuración y costes', 'Configuration and costs'), t('Revisión y borrador', 'Review and draft'),
  ]

  return <div className={styles.shell}>
    <header><h1>Product Studio</h1><p>{t('Explora configuraciones de fabricación y prepara productos para revisión.', 'Explore manufacturing configurations and prepare products for review.')}</p></header>
    <ProgressIndicator currentIndex={step} spaceEqually>{steps.map(label => <ProgressStep key={label} label={label} />)}</ProgressIndicator>
    <CatalogFeedback busy={busy} error={error} />
    {artwork && <div className={styles.artwork}>
      {artwork.primary_image_url && <OptimizedImg src={artwork.primary_image_url} alt={artwork.title} sizes="192px" />}
      <div><strong>{lang === 'en' ? artwork.title_en || artwork.title : artwork.title}</strong><p>{artwork.sku} · {artwork.dimensions}</p>
        {active?.session.source_asset_id && <p>{t('Derivado privado seleccionado', 'Private derivative selected')}</p>}</div>
    </div>}

    {step === 0 && <>
      <section className={styles.section}>
        <h2>{steps[0]}</h2>
        <form className={styles.fields} onSubmit={event => {
          event.preventDefault()
          const query = named(event, 'query')
          run(async () => setArtworks(await callCatalog('artworkSearch', { query })))
        }}>
          <TextInput id="studio-art-search" name="query" labelText={t('Buscar obra por título', 'Find artwork by title')} required />
          <Button type="submit" kind="tertiary" disabled={busy}>{t('Buscar', 'Search')}</Button>
        </form>
        {artworks.map(row => <Button key={row.id} kind="ghost" size="sm" disabled={busy}
          onClick={() => run(async () => setArtworkContext(await callCatalog('artworkAssets', { artworkId: row.id })))}>
          {row.title} · {row.sku}
        </Button>)}
        {artworkContext?.revisions?.map(revision => <Button key={revision.revision_id} kind="ghost" size="sm" disabled={busy}
          onClick={() => run(async () => {
            await callCatalog('registerProductionAsset', { revisionId: revision.revision_id })
            setArtworkContext(await callCatalog('artworkAssets', { artworkId: artwork.id }))
          })}>{t('Registrar derivado privado', 'Register private derivative')} · {revision.size} · {revision.effective_dpi} dpi</Button>)}
        <form className={styles.fields} onSubmit={event => {
          event.preventDefault()
          const selected = named(event, 'provider')
          const countries = named(event, 'countries').split(/[ ,]+/).filter(Boolean).map(code => code.toUpperCase())
          const sourceAssetId = formValue(event, 'asset')
          run(async () => {
            const session = await callCatalog('createSession', { artworkId: artwork?.id, sourceAssetId,
              countries, providers: selected === 'both' ? ['gelato','prodigi'] : [selected] })
            await resume(session.id)
          })
        }}>
          <div className={styles.cols}>
            <Select id="studio-source-asset" name="asset" labelText={t('Derivado de producción', 'Production derivative')}>
              <SelectItem value="" text={t('Sin archivo · validar después', 'No file · validate later')} />
              {artworkContext?.assets?.map(asset => <SelectItem key={asset.id} value={asset.id}
                text={asset.asset_type + ' · ' + (asset.width_px ? asset.width_px + ' × ' + asset.height_px : asset.id)} />)}
            </Select>
            <TextInput id="studio-countries" name="countries" labelText={t('Países de destino (ISO)', 'Target countries (ISO)')} placeholder="MX, US, GB" />
            <Select id="studio-providers" name="provider" labelText={t('Proveedores', 'Providers')}>
              <SelectItem value="both" text={t('Ambos', 'Both')} /><SelectItem value="gelato" text="Gelato" /><SelectItem value="prodigi" text="Prodigi" />
            </Select>
          </div>
          <Button type="submit" disabled={busy}>{t('Iniciar sesión de descubrimiento', 'Start discovery session')}</Button>
        </form>
      </section>
      {sessions.length > 0 && <section className={styles.section}>
        <h2>{t('Continuar una sesión', 'Resume a session')}</h2>
        {sessions.map(session => <Button key={session.id} kind="ghost" size="sm" disabled={busy} onClick={() => run(() => resume(session.id))}>
          {session.artworks?.title || session.id} · {new Date(session.created_at).toLocaleDateString()}
        </Button>)}
      </section>}
    </>}

    {step === 1 && active && <section className={styles.section}>
      <h2>{steps[1]}</h2>
      <form className={styles.fields} onSubmit={event => {
        event.preventDefault()
        const input = { provider: named(event, 'provider'), category: formValue(event, 'category'), query: formValue(event, 'query') }
        run(() => catalogSearch(input))
      }}>
        <div className={styles.cols}>
          <Select id="studio-search-provider" name="provider" labelText={t('Proveedor', 'Provider')} onChange={() => setCategories([])}>
            {active.session.criteria.providers.map(provider => <SelectItem key={provider} value={provider} text={providerNames[provider]} />)}
          </Select>
          <TextInput id="studio-catalog-category" name="category" labelText={t('Categoría del proveedor', 'Supplier category')} list="studio-categories" />
          <datalist id="studio-categories">{categories.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</datalist>
          <TextInput id="studio-search-query" name="query" labelText={t('Término de búsqueda', 'Search term')} />
        </div>
        <div className={styles.row}>
          <Button type="submit" disabled={busy}>{t('Buscar productos', 'Search products')}</Button>
          <Button type="button" kind="tertiary" disabled={busy} onClick={event => {
            const provider = event.currentTarget.form.elements.namedItem('provider').value
            run(async () => setCategories(await callCatalog('categories', { provider })))
          }}>{t('Consultar categorías', 'Browse categories')}</Button>
        </div>
      </form>
      {search && <>
        {search.items.length === 0 && <p>{t('No hay resultados en esta página.', 'No results on this page.')}</p>}
        {search.items.map(item => <article className={styles.item} key={item.externalId}>
          <strong>{item.title}</strong><p>{providerNames[search.input.provider]} · {item.category}</p>
          <Button kind="ghost" size="sm" disabled={busy} onClick={() => run(async () =>
            setInspected(await callCatalog('inspectProduct', { provider: search.input.provider, externalId: item.externalId })))}>
            {t('Ver especificaciones y variantes', 'Inspect specifications and variants')}
          </Button>
        </article>)}
        <div className={styles.row}>
          {(search.input.offset || 0) > 0 && <Button kind="ghost" disabled={busy} onClick={() => run(() =>
            catalogSearch({ ...search.input, offset: Math.max(0, search.input.offset - 25) }))}>{t('Anterior', 'Previous')}</Button>}
          {(search.nextOffset != null || search.total > (search.input.offset || 0) + 25) && <Button kind="ghost" disabled={busy} onClick={() => run(() =>
            catalogSearch({ ...search.input, offset: search.nextOffset ?? (search.input.offset || 0) + 25 }))}>{t('Siguiente', 'Next')}</Button>}
        </div>
      </>}
      {inspected && <section className={styles.section}>
        <h2>{inspected.title}</h2>
        {inspected.description && <p>{inspected.description}</p>}
        {inspected.variants.map(variant => <article key={variant.externalVariantId} className={styles.item}>
          <strong>{variant.title}</strong><p className={styles.mono}>{variant.sku}</p>
          {variant.widthMm && variant.heightMm && <p>{variant.widthMm} × {variant.heightMm} mm</p>}
          <details className={styles.details}><summary>{t('Especificaciones del fabricante', 'Manufacturer specifications')}</summary><pre>{JSON.stringify({
            attributes: variant.attributes, printAreas: variant.printAreas, options: variant.options,
          }, null, 2)}</pre></details>
          <Button kind="tertiary" size="sm" disabled={busy} onClick={() => run(() => saveCandidate(variant.externalVariantId))}>
            {t('Guardar candidato', 'Save candidate')}
          </Button>
        </article>)}
        {inspected.total > (inspected.offset || 0) + 25 && <Button kind="ghost" disabled={busy} onClick={() => run(async () => {
          const offset = (inspected.offset || 0) + 25
          setInspected({ ...await callCatalog('inspectProduct', { provider: search.input.provider, externalId: inspected.externalId, offset }), offset })
        })}>{t('Más variantes', 'More variants')}</Button>}
      </section>}
      {active.candidates.length > 0 && <section className={styles.section}>
        <h2>{t('Candidatos guardados', 'Saved candidates')}</h2>
        <div className={styles.cols}>{active.candidates.map(row => <article className={styles.item} key={row.id}>
          <strong>{row.provider_catalog_variants?.external_sku}</strong>
          <p>{providerNames[row.provider_code]} · {row.compatibility.status.replaceAll('_',' ')}</p>
          <Button kind="ghost" size="sm" onClick={() => openCandidate(row)}>{t('Revisar candidato', 'Review candidate')}</Button>
        </article>)}</div>
      </section>}
      <Button kind="ghost" onClick={() => setStep(0)}>{t('Cambiar obra o sesión', 'Change artwork or session')}</Button>
    </section>}

    {step === 2 && candidate && <section className={styles.section}>
      <h2>{steps[2]}</h2>
      <p>{providerNames[candidate.provider_code]} · {candidate.provider_catalog_variants.external_sku}</p>
      <p className={styles.mono}>{candidate.id}</p>
      <Tag type="cool-gray">{candidate.compatibility.status.replaceAll('_',' ')}</Tag>
      {active.session.source_asset_id && <details className={styles.details}>
        <summary>{t('Verificar compatibilidad', 'Validate compatibility')}</summary>
        <form className={styles.fields} onSubmit={event => {
          event.preventDefault()
          const dimensions = Object.fromEntries(['widthMm','heightMm','bleedMm','minimumDpi'].map(key => [key, Number(named(event, key))]))
          run(async () => {
            const compatibility = await callCatalog('validateCompatibility', { candidateId: candidate.id, ...dimensions, printableAreaVerified: true })
            setCandidate({ ...candidate, compatibility })
            setActive({ ...active, candidates: active.candidates.map(row => row.id === candidate.id ? { ...row, compatibility } : row) })
          })
        }}>
          <p>{t('Confirma estas medidas y el sangrado con la ficha del fabricante antes de evaluar.', 'Confirm the printable dimensions and bleed against the supplier specification before evaluating.')}</p>
          <div className={styles.cols}>
            <TextInput id="compat-width" name="widthMm" labelText={t('Ancho (mm)', 'Width (mm)')} type="number" min="0.01" step="any" required />
            <TextInput id="compat-height" name="heightMm" labelText={t('Alto (mm)', 'Height (mm)')} type="number" min="0.01" step="any" required />
            <TextInput id="compat-bleed" name="bleedMm" labelText={t('Sangrado por borde (mm)', 'Bleed per edge (mm)')} type="number" min="0" step="any" required />
            <TextInput id="compat-dpi" name="minimumDpi" labelText={t('DPI mínimo', 'Minimum DPI')} type="number" min="1" step="any" required />
          </div>
          <Button size="sm" type="submit" disabled={busy}>{t('Evaluar con medidas verificadas', 'Evaluate verified dimensions')}</Button>
        </form>
      </details>}
      {candidate.compatibility.optimisticDpi != null && <p>{t('Resolución máxima estimada antes del sangrado', 'Estimated upper DPI before bleed')} · {candidate.compatibility.optimisticDpi}</p>}
      <form className={styles.fields} onSubmit={event => {
        event.preventDefault()
        const combination = named(event, 'combination')
        const input = { candidateId: candidate.id, currency: named(event, 'currency').toUpperCase(), quantity: 1,
          attributes: combination ? candidateSpec.combinations[Number(combination) - 1].attributes : undefined,
          destination: { country: named(event, 'country').toUpperCase(), line1: named(event, 'line1'), city: named(event, 'city'),
            postalCode: named(event, 'postalCode'), region: formValue(event, 'region') } }
        run(async () => { setQuote(await callCatalog('quoteCandidate', input)); setProposal(null) })
      }}>
        <div className={styles.cols}>
          {candidateSpec.combinations?.length > 0 && <Select id="studio-combination" name="combination" labelText={t('Configuración verificada por proveedor', 'Supplier-listed configuration')}>
            <SelectItem value="" text={t('Configuración predeterminada', 'Default configuration')} />
            {candidateSpec.combinations.map((combo, index) => <SelectItem key={index} value={String(index + 1)} text={Object.values(combo.attributes || {}).join(' · ')} />)}
          </Select>}
          <TextInput id="studio-country" name="country" labelText={t('País de entrega (ISO)', 'Destination country (ISO)')} defaultValue={active.session.criteria.countries[0] || ''} required maxLength={2} />
          <TextInput id="studio-currency" name="currency" labelText={t('Moneda de cotización', 'Quote currency')} defaultValue="USD" required maxLength={3} />
          <TextInput id="studio-line1" name="line1" labelText={t('Calle para cotizar', 'Quote address line')} required />
          <TextInput id="studio-city" name="city" labelText={t('Ciudad', 'City')} required />
          <TextInput id="studio-region" name="region" labelText={t('Estado o provincia', 'State or province')} />
          <TextInput id="studio-postal" name="postalCode" labelText={t('Código postal', 'Postal code')} required />
        </div>
        <Button type="submit" disabled={busy}>{t('Solicitar cotización', 'Request quote')}</Button>
      </form>
      {quote && <>
        <p>{quote.currency} · {t('Producción', 'Manufacturing')} {quote.manufacturing_minor} · {t('Envío', 'Shipping')} {quote.shipping_minor} · {t('Impuestos', 'Tax')} {quote.tax_minor ?? t('sin confirmar', 'unconfirmed')} ({t('unidades menores', 'minor units')})</p>
        <p>{t('Vigencia', 'Expires')} {new Date(quote.expires_at).toLocaleString()}</p>
        <form className={styles.fields} onSubmit={event => {
          event.preventDefault()
          const margin = Number(named(event, 'margin')) * 100
          const tax = formValue(event, 'tax')
          const retailCurrency = named(event, 'retailCurrency').toUpperCase() || quote.currency
          const fxAsOf = named(event, 'fxAsOf')
          const fx = retailCurrency === quote.currency || !fxAsOf ? undefined : {
            from: quote.currency, to: retailCurrency, source: named(event, 'fxSource'),
            asOf: new Date(fxAsOf).toISOString(), minorRate: Number(named(event, 'fxRate')),
          }
          const input = { quoteId: quote.id, currency: retailCurrency, fx, policy: { type: 'target_margin', value: margin },
            assumedTaxMinor: tax == null ? undefined : Number(tax) }
          run(async () => setProposal({ ...await callCatalog('proposePrice', input), input }))
        }}>
          <div className={styles.cols}>
            <TextInput id="studio-margin" name="margin" type="number" min="0" max="99" defaultValue="40" labelText={t('Margen objetivo (%)', 'Target margin (%)')} required />
            {quote.tax_minor == null && <TextInput id="studio-tax" name="tax" type="number" min="0"
              labelText={t('Impuesto supuesto (unidades menores)', 'Assumed tax (minor units)')} required />}
          </div>
          <details className={styles.details}>
            <summary>{t('Convertir a la moneda de venta', 'Convert to the retail currency')}</summary>
            <div className={styles.cols}>
              <TextInput id="studio-retail-currency" name="retailCurrency" labelText={t('Moneda de venta (ISO)', 'Retail currency (ISO)')} maxLength={3} />
              <TextInput id="studio-fx-rate" name="fxRate" labelText={t('Unidades menores destino por unidad menor origen', 'Target minor units per source minor unit')}
                type="number" min="0" step="any" />
              <TextInput id="studio-fx-source" name="fxSource" labelText={t('Fuente del tipo de cambio', 'Exchange-rate source')} />
              <TextInput id="studio-fx-asof" name="fxAsOf" labelText={t('Fecha y hora local de la tasa', 'Local date and time of the rate')} type="datetime-local" />
            </div>
          </details>
          <Button type="submit" kind="tertiary" disabled={busy}>{t('Calcular propuesta', 'Calculate proposal')}</Button>
        </form>
      </>}
      {proposal && <p role="status">{t('Precio propuesto', 'Suggested retail')} · {proposal.retailMinor} {proposal.currency} ({t('unidades menores', 'minor units')}) · {proposal.grossMarginBps / 100}%</p>}
      <div className={styles.row}>
        <Button kind="ghost" onClick={() => setStep(1)}>{t('Candidatos', 'Candidates')}</Button>
        <Button kind="secondary" onClick={() => setStep(3)}>{t('Revisar borrador', 'Review draft')}</Button>
      </div>
    </section>}

    {step === 3 && candidate && <section className={styles.section}>
      <h2>{steps[3]}</h2>
      <p>{providerNames[candidate.provider_code]} · {candidate.provider_catalog_variants.external_sku}</p>
      {!draft && <DraftForm families={options?.families || []} artworkId={artwork?.id} candidateId={candidate.id}
        initialTitle={candidateSpec.title} disabled={busy}
        onSave={input => run(async () => setDraft(await callCatalog('createDraft', { ...input, quoteId: quote?.id })))} />}
      {draft && <>
        <p role="status">{t('Borrador guardado', 'Draft saved')}</p>
        {proposal && !savedPrice && <form className={styles.fields} onSubmit={event => {
          event.preventDefault()
          const bookId = named(event, 'book')
          const amountMinor = Number(named(event, 'retail'))
          run(async () => {
            await callCatalog('addPriceDraft', { bookId, amountMinor, variantId: draft.variant_id, proposal: proposal.input })
            setSavedPrice(true)
          })
        }}>
          <Select id="studio-book" name="book" labelText={t('Lista para el precio propuesto', 'Book for proposed price')} required>
            <SelectItem value="" text={t('Seleccionar', 'Select')} />
            {options?.books.filter(book => book.country === proposal.country && book.currency === proposal.currency && ['draft','active'].includes(book.status))
              .map(book => <SelectItem key={book.id} value={book.id} text={book.name} />)}
          </Select>
          <TextInput id="studio-retail" name="retail" labelText={t('Precio revisado (unidades menores)', 'Reviewed price (minor units)')}
            type="number" min="1" defaultValue={proposal.retailMinor} required />
          <Button type="submit" disabled={busy}>{t('Guardar precio como borrador', 'Save draft price')}</Button>
        </form>}
        {savedPrice && <p role="status">{t('Precio pendiente de aprobación', 'Price awaiting approval')}</p>}
        <Link href={'/admin/products' + (draft.product_id ? '?id=' + draft.product_id : '')}>{t('Abrir Productos', 'Open Products')}</Link>
      </>}
      <Button kind="ghost" onClick={() => setStep(2)}>{t('Volver a los costes', 'Back to costs')}</Button>
    </section>}
  </div>
}
