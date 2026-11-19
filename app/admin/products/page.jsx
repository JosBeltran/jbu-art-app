'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Select, SelectItem, TextArea, TextInput, Tag } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { callCatalog, useCatalog } from '@/components/admin/productCatalog/useCatalog'
import { BookSelect, CatalogFeedback, DraftForm, named, VariantFields, variantFrom } from '@/components/admin/productCatalog/CatalogFields'
import styles from '@/components/admin/productCatalog/ProductCatalog.module.css'

export default function Products() {
  const { t, lang } = useI18n()
  const { busy, error, run } = useCatalog()
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null)
  const [mode, setMode] = useState('list')
  const [offset, setOffset] = useState(0)
  const [jobs, setJobs] = useState([])
  const [jobQuotes, setJobQuotes] = useState({})

  async function load(next = offset) {
    setList(await callCatalog('list', { offset: next }))
    setOffset(next)
  }
  async function open(productId) {
    setDetail(await callCatalog('productDetails', { productId }))
    setMode('detail')
  }
  useEffect(() => {
    run(async () => {
      await load(0)
      const id = new URL(window.location.href).searchParams.get('id')
      if (id) await open(id)
    })
    // Only initialize this screen on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function change(operation, input, reloadDetail = false) {
    return run(async () => {
      await callCatalog(operation, input)
      await load()
      if (reloadDetail && detail) await open(detail.product.id)
    })
  }
  async function loadJobs() {
    setJobs(await callCatalog('listFulfillment'))
    setMode('fulfillment')
  }
  function changeJob(operation, input) {
    run(async () => {
      await callCatalog(operation, input)
      await loadJobs()
    })
  }
  const product = detail?.product
  const canEdit = product?.status === 'draft' && !product.legacy_source

  return <div className={styles.shell}>
    <header><h1>{t('Productos', 'Products')}</h1><Link href="/admin/product-studio">Product Studio</Link></header>
    <CatalogFeedback busy={busy} error={error} />
    <nav className={styles.row} aria-label={t('Administración de productos', 'Product management')}>
      <Button kind={mode === 'list' ? 'primary' : 'ghost'} size="sm" disabled={busy} onClick={() => setMode('list')}>{t('Catálogo', 'Catalog')}</Button>
      <Button kind={mode === 'new' ? 'primary' : 'ghost'} size="sm" disabled={busy} onClick={() => setMode('new')}>{t('Nuevo producto', 'New product')}</Button>
      <Button kind={mode === 'books' ? 'primary' : 'ghost'} size="sm" disabled={busy} onClick={() => setMode('books')}>{t('Listas de precios', 'Price books')}</Button>
      <Button kind={mode === 'fulfillment' ? 'primary' : 'ghost'} size="sm" disabled={busy}
        onClick={() => run(loadJobs)}>{t('Producción', 'Fulfillment')}</Button>
    </nav>
    {mode === 'fulfillment' && <section className={styles.section}>
      <h2>{t('Órdenes de producción', 'Production orders')}</h2>
      <CatalogAction title={t('Preparar print pagado', 'Prepare paid print')} prefix="prepare" busy={busy}
        fields={{ orderItemId: t('ID del artículo pagado', 'Paid order item ID'), mappingId: t('ID de asignación del proveedor', 'Provider mapping ID') }}
        confirm={t('¿Crear una preparación para este artículo?', 'Prepare this item for fulfillment?')}
        save={values => changeJob('prepareFulfillment', { ...values, confirm: true })} />
      {jobs.map(job => <article key={job.id} className={styles.item}>
        <strong>{job.provider_code} · {job.country} · {job.state}</strong>
        <p className={styles.mono}>{job.id}</p>
        {job.provider_order_id && <p>{job.provider_order_id} · {job.provider_status}</p>}
        {['pending_review','approved'].includes(job.state) && <>
          <CatalogAction title={t('Cotizar para la dirección del pedido', 'Quote for the paid order address')}
            prefix={'quote-' + job.id} busy={busy}
            fields={{ candidateId: t('ID del candidato del proveedor', 'Supplier candidate ID'), currency: t('Moneda de cotización (ISO)', 'Quote currency (ISO)') }}
            save={values => run(async () => {
              const quote = await callCatalog('quoteFulfillment', { jobId: job.id, ...values, currency: values.currency.toUpperCase() })
              setJobQuotes(previous => ({ ...previous, [job.id]: quote }))
            })} />
          {jobQuotes[job.id] && <JobQuote job={job} quote={jobQuotes[job.id]} busy={busy} changeJob={changeJob} />}
        </>}
        {job.state === 'approved' && <Button size="sm" kind="danger" disabled={busy} onClick={() => {
          if (window.confirm(t('¿Enviar este pedido al fabricante ahora?', 'Send this order to the manufacturer now?'))) {
            changeJob('submitFulfillment', { jobId: job.id, confirm: true })
          }
        }}>{t('Enviar al fabricante', 'Send to manufacturer')}</Button>}
        {job.state === 'submitted' && <Button size="sm" kind="ghost" disabled={busy}
          onClick={() => changeJob('syncFulfillment', { jobId: job.id })}>{t('Consultar estado', 'Refresh status')}</Button>}
      </article>)}
    </section>}
    {mode === 'list' && <section className={styles.section}>
      {list?.products.length === 0 && <p>{t('Todavía no hay productos.', 'There are no products yet.')}</p>}
      {list?.products.map(row => <article className={styles.item} key={row.id}>
        <div className={styles.row}><strong>{lang === 'en' ? row.title_en || row.title_es : row.title_es}</strong>
          <Tag type="cool-gray">{row.legacy_source ? t('Referencia histórica', 'Legacy reference') : row.status}</Tag></div>
        <p className={styles.mono}>{row.sku}</p>
        <Button kind="ghost" size="sm" disabled={busy} onClick={() => run(() => open(row.id))}>{t('Abrir producto', 'Open product')}</Button>
      </article>)}
      <div className={styles.row}>
        {offset > 0 && <Button kind="ghost" disabled={busy} onClick={() => run(() => load(offset - 25))}>{t('Anterior', 'Previous')}</Button>}
        {list?.nextOffset != null && <Button kind="ghost" disabled={busy} onClick={() => run(() => load(list.nextOffset))}>{t('Siguiente', 'Next')}</Button>}
      </div>
    </section>}
    {mode === 'new' && <section className={styles.section}>
      <h2>{t('Nuevo producto independiente', 'New independent product')}</h2>
      <DraftForm disabled={busy} families={list?.families || []} onSave={input => run(async () => {
        const created = await callCatalog('createDraft', input)
        await load(0)
        await open(created.product_id)
      })} />
    </section>}
    {mode === 'books' && <section className={styles.section}>
      <h2>{t('Listas de precios por país', 'Country price books')}</h2>
      <form className={styles.fields} onSubmit={event => {
        event.preventDefault()
        change('addBookDraft', { code: named(event, 'code'), name: named(event, 'name'),
          country: named(event, 'country').toUpperCase(), currency: named(event, 'currency').toUpperCase() })
      }}>
        <div className={styles.cols}>
          <TextInput id="book-code" name="code" labelText={t('Código interno', 'Internal code')} required />
          <TextInput id="book-name" name="name" labelText={t('Nombre', 'Name')} required />
          <TextInput id="book-country" name="country" labelText={t('País (ISO)', 'Country (ISO)')} maxLength={2} required />
          <TextInput id="book-currency" name="currency" labelText={t('Moneda (ISO)', 'Currency (ISO)')} maxLength={3} required />
        </div>
        <Button type="submit" disabled={busy}>{t('Crear lista borrador', 'Create draft book')}</Button>
      </form>
      {list?.books.map(book => <article className={styles.item} key={book.id}>
        <strong>{book.name}</strong><p>{[book.country, book.currency, book.status].filter(Boolean).join(' · ')}</p>
        {book.status === 'draft' && <Button kind="tertiary" size="sm" disabled={busy} onClick={() => {
          if (window.confirm(t('¿Activar la lista con sus precios aprobados?', 'Activate the book with its approved prices?'))) {
            change('activateBook', { bookId: book.id, confirm: true })
          }
        }}>{t('Activar lista', 'Activate book')}</Button>}
      </article>)}
    </section>}
    {mode === 'detail' && product && <section className={styles.section}>
      <h2>{lang === 'en' ? product.title_en || product.title_es : product.title_es}</h2>
      <p>{product.sku} · {product.family_code}</p>
      {product.legacy_source && <p>{t('La obra o el print original sigue controlando precios, disponibilidad y compra.', 'The original artwork or print record remains authoritative for pricing, availability and checkout.')}</p>}
      {detail.artworks.map(row => <Link key={row.artworks.id} href={'/admin/artworks/' + row.artworks.id + '/edit'}>
        {row.artworks.title} · {row.artworks.sku}
      </Link>)}
      {canEdit && <details className={styles.details}>
        <summary>{t('Editar contenido', 'Edit content')}</summary>
        <form key={product.id} className={styles.fields} onSubmit={event => {
          event.preventDefault()
          change('editProduct', { productId: product.id, titleEs: named(event, 'titleEs'), titleEn: named(event, 'titleEn') || undefined,
            descriptionEs: named(event, 'descriptionEs') || undefined, descriptionEn: named(event, 'descriptionEn') || undefined }, true)
        }}>
          <TextInput id="edit-title-es" name="titleEs" labelText={t('Título en español', 'Spanish title')} defaultValue={product.title_es} required />
          <TextInput id="edit-title-en" name="titleEn" labelText={t('Título en inglés', 'English title')} defaultValue={product.title_en || ''} />
          <TextArea id="edit-description-es" name="descriptionEs" labelText={t('Descripción en español', 'Spanish description')} defaultValue={product.description_es || ''} />
          <TextArea id="edit-description-en" name="descriptionEn" labelText={t('Descripción en inglés', 'English description')} defaultValue={product.description_en || ''} />
          <Button type="submit" disabled={busy}>{t('Guardar', 'Save')}</Button>
        </form>
      </details>}
      {detail.media.map(row => <a key={row.asset_id} href={row.art_assets.public_url} target="_blank" rel="noreferrer">
        {t('Ver fotografía vinculada', 'View linked photograph')}
      </a>)}
      {canEdit && <>
        <CatalogAction title={t('Vincular obra', 'Link artwork')} prefix="link-art" busy={busy}
          fields={{ artworkId: t('ID de obra', 'Artwork ID') }} save={values => change('linkArtwork', { productId: product.id, ...values }, true)} />
        {detail.artworks.length > 0 && <CatalogAction title={t('Añadir fotografía de obra', 'Add artwork photograph')} prefix="add-photo" busy={busy}
          fields={{ artworkId: t('ID de obra vinculada', 'Linked artwork ID') }}
          save={values => change('addArtworkPhoto', { productId: product.id, ...values }, true)} />}
        <Button size="sm" kind="tertiary" disabled={busy || !detail.variants.length} onClick={() => {
          if (window.confirm(t('¿Enviar este producto a revisión?', 'Submit this product for review?'))) {
            change('reviewProduct', { productId: product.id, confirm: true }, true)
          }
        }}>{t('Enviar a revisión', 'Submit for review')}</Button>
      </>}
      <h2>{t('Variantes', 'Variants')}</h2>
      {detail.variants.map(row => <article className={styles.item} key={row.id}>
        <strong>{row.title || row.sku}</strong><p>{row.fulfillment_type} · {row.inventory_policy} · {row.status}</p>
        {row.allowed_countries?.length > 0 && <p>{row.allowed_countries.join(', ')}</p>}
        {row.product_variant_attribute_values?.length > 0 && <ul>{row.product_variant_attribute_values.map(attr =>
          <li key={attr.attribute_code}>{attr.attribute_code} · {String(attr.text_value ?? attr.enum_value ?? attr.number_value ?? attr.boolean_value)}</li>)}</ul>}
        {(canEdit || product.legacy_source) && <CatalogAction title={t('Vincular candidato del proveedor', 'Link supplier candidate')}
          prefix={'candidate-' + row.id} busy={busy} fields={{ candidateId: t('ID de candidato de Product Studio', 'Product Studio candidate ID') }}
          save={values => change('linkProviderCandidate', { variantId: row.id, ...values }, true)} />}
        {row.provider_product_mappings?.map(mapping => <div key={mapping.id}>
          <p className={styles.mono}>{mapping.provider_code} · {mapping.external_variant_id} · {mapping.validation_status} · {mapping.id}</p>
          {!mapping.enabled && <CatalogAction title={t('Validar asignación de producción', 'Validate production mapping')}
            prefix={'mapping-' + mapping.id} busy={busy}
            fields={{ assetId: t('ID de derivado privado de producción', 'Private production derivative ID'),
              countries: t('Países permitidos (separados por comas)', 'Allowed countries (comma-separated)') }}
            confirm={t('¿Confirmas que el proveedor usa una sola área predeterminada y que este archivo corresponde a ella?',
              'Confirm that the supplier uses one default print area and this file matches it?')}
            save={values => change('enableMapping', { mappingId: mapping.id, assetId: values.assetId,
              countries: splitCountries(values.countries), verifiedSingleDefaultArea: true, confirm: true }, true)} />}
        </div>)}
        {canEdit && <CatalogAction title={t('Editar destinos', 'Edit destinations')} prefix={'countries-' + row.id} busy={busy}
          fields={{ countries: t('Países permitidos (separados por comas)', 'Allowed countries (comma-separated)') }}
          initial={{ countries: row.allowed_countries?.join(', ') }} optional={['countries']}
          save={values => change('setVariantCountries', { variantId: row.id, countries: splitCountries(values.countries) }, true)} />}
        {canEdit && <details className={styles.details}>
          <summary>{t('Configurar atributo', 'Configure attribute')}</summary>
          <AttributeForm attributes={detail.attributes} variantId={row.id} busy={busy} save={input => change('setVariantAttribute', input, true)} />
        </details>}
        <ul>{row.price_book_entries?.map(entry => {
          const book = list?.books.find(book => book.id === entry.price_book_id)
          return <li key={entry.id} className={styles.row}>
            {entry.amount_minor} {book?.currency} ({t('unidades menores', 'minor units')}) · {book?.name} · {entry.status}
            {entry.status === 'draft' && <Button kind="ghost" size="sm" disabled={busy} onClick={() => {
              if (window.confirm(t('¿Aprobar este precio?', 'Approve this price?'))) {
                change('approvePrice', { entryId: entry.id, confirm: true }, true)
              }
            }}>{t('Aprobar precio', 'Approve price')}</Button>}
          </li>
        })}</ul>
        {canEdit && <details className={styles.details}>
          <summary>{t('Crear precio borrador', 'Create draft price')}</summary>
          <form className={styles.fields} onSubmit={event => {
            event.preventDefault()
            change('addPriceDraft', { variantId: row.id, bookId: named(event, 'book'), amountMinor: Number(named(event, 'amount')) }, true)
          }}>
            <BookSelect books={list?.books || []} id={'book-' + row.id} />
            <TextInput id={'amount-' + row.id} name="amount" labelText={t('Importe en unidades menores', 'Amount in minor units')}
              type="number" min="1" step="1" required />
            <Button type="submit" kind="tertiary" disabled={busy}>{t('Guardar borrador de precio', 'Save draft price')}</Button>
          </form>
        </details>}
      </article>)}
      {canEdit && <details className={styles.details}>
        <summary>{t('Agregar variante', 'Add variant')}</summary>
        <form className={styles.fields} onSubmit={event => {
          event.preventDefault()
          change('addVariant', { productId: product.id, variant: variantFrom(event) }, true)
        }}>
          <VariantFields prefix="add-variant" />
          <Button type="submit" disabled={busy}>{t('Crear variante', 'Create variant')}</Button>
        </form>
      </details>}
    </section>}
  </div>
}

function AttributeForm({ attributes, variantId, busy, save }) {
  const { t, lang } = useI18n()
  const [code, setCode] = useState(attributes[0]?.code)
  const attribute = attributes.find(row => row.code === code)
  if (!attribute) return null
  return <form className={styles.fields} onSubmit={event => {
    event.preventDefault()
    const value = named(event, 'value')
    save({ variantId, attribute: code, value: attribute.value_type === 'boolean' ? value === 'true'
      : ['number','measurement'].includes(attribute.value_type) ? Number(value) : value })
  }}>
    <Select id={'attribute-' + variantId} labelText={t('Atributo', 'Attribute')} value={code} onChange={event => setCode(event.target.value)}>
      {attributes.map(row => <SelectItem key={row.code} value={row.code} text={lang === 'en' ? row.label_en : row.label_es} />)}
    </Select>
    {attribute.value_type === 'enum' || attribute.value_type === 'boolean' ? <Select key={code} id={'value-' + variantId}
      name="value" labelText={t('Valor', 'Value')} required>
      {(attribute.value_type === 'boolean' ? [{ code: 'true', label_es: 'Sí', label_en: 'Yes' }, { code: 'false', label_es: 'No', label_en: 'No' }]
        : attribute.product_attribute_values).map(row => <SelectItem key={row.code} value={row.code} text={lang === 'en' ? row.label_en : row.label_es} />)}
    </Select> : <TextInput key={code} id={'value-' + variantId} name="value"
      type={['number','measurement'].includes(attribute.value_type) ? 'number' : 'text'} step="any"
      labelText={t('Valor', 'Value') + (attribute.measurement_unit ? ' · ' + attribute.measurement_unit : '')} required />}
    <Button type="submit" kind="tertiary" disabled={busy}>{t('Guardar atributo', 'Save attribute')}</Button>
  </form>
}

const splitCountries = value => value.split(',').map(country => country.trim().toUpperCase()).filter(Boolean)

function CatalogAction({ title, prefix, fields, initial = {}, optional = [], confirm, busy, save }) {
  const { t } = useI18n()
  return <details className={styles.details}>
    <summary>{title}</summary>
    <form className={styles.fields} onSubmit={event => {
      event.preventDefault()
      if (confirm && !window.confirm(confirm)) return
      save(Object.fromEntries(Object.keys(fields).map(name => [name, named(event, name)])))
    }}>
      {Object.entries(fields).map(([name, label]) => <TextInput key={name} id={prefix + '-' + name} name={name}
        labelText={label} defaultValue={initial[name]} required={!optional.includes(name)} />)}
      <Button type="submit" size="sm" kind="tertiary" disabled={busy}>{t('Guardar', 'Save')}</Button>
    </form>
  </details>
}

function JobQuote({ job, quote, busy, changeJob }) {
  const { t } = useI18n()
  return <div className={styles.item}>
    <p>{quote.currency} · {t('Fabricación en unidades menores', 'Manufacturing in minor units')} · {quote.manufacturingMinor}</p>
    <p>{t('Impuestos en unidades menores', 'Tax in minor units')} · {quote.taxMinor ?? t('Sin información', 'Unreported')}</p>
    <p>{t('Vence', 'Expires')} · {new Date(quote.expires_at).toLocaleTimeString()}</p>
    {quote.methods.filter(method => method.method && method.shippingMinor != null).map(method => <div key={method.method} className={styles.row}>
      <p>{method.method} · {method.shippingMinor} {quote.currency} ({t('envío en unidades menores', 'shipping in minor units')})
        {method.manufacturingMinor != null && <> · {t('Fabricación', 'Manufacturing')} {method.manufacturingMinor}</>}
        {method.taxMinor != null && <> · {t('Impuestos', 'Tax')} {method.taxMinor}</>}</p>
      <Button size="sm" kind="tertiary" disabled={busy} onClick={() => {
        if (window.confirm(t('¿Aprobar este envío para producción?', 'Approve this shipping method for production?'))) {
          changeJob('approveFulfillment', { jobId: job.id, quoteId: quote.id, shippingMethod: method.method, confirm: true })
        }
      }}>{t('Aprobar envío', 'Approve shipping')}</Button>
    </div>)}
  </div>
}
