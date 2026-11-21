'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Checkbox, Select, SelectItem, TextArea, TextInput, Tag } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { callCatalog, useCatalog } from '@/components/admin/productCatalog/useCatalog'
import { BookSelect, CatalogFeedback, DraftForm, named, VariantFields, variantFrom } from '@/components/admin/productCatalog/CatalogFields'
import styles from '@/components/admin/productCatalog/ProductCatalog.module.css'
import { authHeaders } from '@/lib/authHeaders'
import { wallArtMoney } from '@/lib/productCatalog/wallArt'
import { artworkPrintHref } from '@/lib/printRoutes'
import OptimizedImg from '@/components/media/OptimizedImg'
import CommercialPresentations from '@/app/prints/[variantId]/CommercialPresentations'
import ProductOverview from '@/components/admin/productCatalog/ProductOverview'
import WallArtMockup from '@/components/admin/productCatalog/WallArtMockup'

export default function Products() {
  const { t, lang } = useI18n()
  const { busy, error, run } = useCatalog()
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null)
  const [publication, setPublication] = useState({})
  const [imageFeedback, setImageFeedback] = useState({})
  const [customerPreview, setCustomerPreview] = useState(false)
  const [mode, setMode] = useState('list')
  const [offset, setOffset] = useState(0)
  const [jobs, setJobs] = useState([])
  const [jobQuotes, setJobQuotes] = useState({})

  async function load(next = offset) {
    setList(await callCatalog('list', { offset: next }))
    setOffset(next)
  }
  async function open(productId) {
    const next = await callCatalog('productDetails', { productId })
    setDetail(next)
    setPublication(next.readiness || {})
    setCustomerPreview(false)
    setMode('detail')
  }
  useEffect(() => {
    run(async () => {
      await load(0)
      const id = new URL(window.location.href).searchParams.get('id')
      if (id) await open(id)
      else if(new URL(window.location.href).searchParams.get('new')==='1')setMode('new')
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
  function lifecycle(action, variantId) {
    if (window.confirm(t('¿Aplicar este cambio de publicación?', 'Apply this publication change?'))) {
      run(async () => {
        try {
          await callCatalog('transitionPublication',{ action,productId:detail.product.id,variantId,confirm:true })
        } catch (error) {
          if (!error.problems) throw error
          setPublication(previous=>({...previous,[variantId]:error.problems}))
          throw new Error(error.problems.map(code=>t(...(publicationLabels[code] || [code,code]))).join(' '))
        }
        await load()
        await open(detail.product.id)
      })
    }
  }
  function uploadGallery(event, variantId) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    data.set('variantId',variantId)
    run(async () => {
      setImageFeedback(previous=>({...previous,[variantId]:null}))
      try {
        const res = await fetch('/api/admin/product-catalog/commercial-image',{ method:'POST',headers:await authHeaders(),body:data })
        const result = await res.json().catch(()=>null)
        if (!res.ok) {
          const message = res.status === 413 || result?.error === 'gallery_image_too_large'
            ? t('La imagen supera 4 MB. Sube una copia más ligera.','The image exceeds 4 MB. Upload a smaller copy.')
            : result?.error === 'invalid_commercial_image'
              ? t('Revisa el formato de la imagen, los textos alternativos y la confirmación.','Check the image format, alt text and confirmation.')
              : t('No se pudo guardar la imagen comercial.','The commercial image could not be saved.')
          setImageFeedback(previous=>({...previous,[variantId]:{error:message}}))
          return
        }
        setImageFeedback(previous=>({...previous,[variantId]:{status:t('Imagen comercial guardada.','Commercial image saved.')}}))
      } catch {
        setImageFeedback(previous=>({...previous,[variantId]:{error:t('No se pudo confirmar la carga. Revisa la galería antes de reintentar.','Upload could not be confirmed. Check the gallery before retrying.')}}))
        return
      }
      await open(detail.product.id)
    })
  }
  const product = detail?.product
  const previewArtwork = detail?.artworks[0]?.artworks
  const previewRows = detail?.variants.map(row => ({
    id:row.id,productId:product.id,artworkId:previewArtwork?.id,title:product.title_es,titleEn:product.title_en,
    description:product.description_es,descriptionEn:product.description_en,variantTitle:row.title,
    attributes:row.product_variant_attribute_values.map(attribute=>({ code:attribute.attribute_code,
      value:attribute.text_value ?? attribute.number_value ?? attribute.enum_value ?? attribute.boolean_value })),
    gallery:commercialGallery(row).map(image=>({url:image.art_assets.public_url,altEs:image.alt_es,altEn:image.alt_en})),
    countries:[],priceBooks:[],entries:[],
  })).filter(row=>row.gallery.length)
  function openRequirement(event, id) {
    event.preventDefault()
    const section = document.getElementById(id)
    if (!section) return
    for (let parent = section; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true
    }
    section.scrollIntoView({ block: 'center' })
    section.querySelector('summary, button, input')?.focus({ preventScroll: true })
  }
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
      <p>{product.sku} · {product.family_code.replaceAll('_',' ')}</p>
      <ProductOverview detail={{...detail,readiness:publication}} onRequirement={openRequirement} books={list?.books || []} families={list?.families || []} requirementLabels={publicationLabels} />
      {product.legacy_source && <p>{t('La obra o el print original sigue controlando precios, disponibilidad y compra.', 'The original artwork or print record remains authoritative for pricing, availability and checkout.')}</p>}
      {detail.artworks.map(row => <Link key={row.artworks.id} href={'/admin/artworks/' + row.artworks.id + '/edit'}>
        {row.artworks.title} · {row.artworks.sku}
      </Link>)}
      {previewArtwork && <Link href={artworkPrintHref(previewArtwork.sku)}>{t('Abrir obra en Fine Art Prints','Open artwork in Fine Art Prints')}</Link>}
      {!product.legacy_source && <div className={styles.row}>
        <Tag>{product.status}</Tag>
        {product.status === 'pending_review' && <Button size="sm" kind="tertiary" disabled={busy} onClick={()=>lifecycle('approve')}>{t('Aprobar producto','Approve product')}</Button>}
        {['pending_review','approved','unpublished'].includes(product.status) && <Button size="sm" kind="ghost" disabled={busy} onClick={()=>lifecycle('revise')}>{t('Volver a borrador','Return to draft')}</Button>}
        {product.status === 'published' && <Button size="sm" kind="tertiary" disabled={busy} onClick={()=>lifecycle('unpublish')}>{t('Retirar producto','Unpublish product')}</Button>}
        {['draft','approved','unpublished'].includes(product.status) && <Button size="sm" kind="ghost" disabled={busy} onClick={()=>lifecycle('archive')}>{t('Archivar','Archive')}</Button>}
        {!!previewRows?.length && <Button size="sm" kind="ghost" onClick={()=>setCustomerPreview(!customerPreview)}>{t('Vista previa del cliente','Customer preview')}</Button>}
      </div>}
      {customerPreview && <CommercialPresentations variants={previewRows} title={previewArtwork?.title || product.title_es} preview />}
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
        {!detail.artworks.length && <CatalogAction title={t('Vincular obra', 'Link artwork')} prefix="link-art" busy={busy}
          fields={{ artworkId: t('ID de obra', 'Artwork ID') }} save={values => change('linkArtwork', { productId: product.id, ...values }, true)} />}
        {detail.artworks.length > 0 && <CatalogAction title={t('Añadir fotografía de obra', 'Add artwork photograph')} prefix="add-photo" busy={busy}
          fields={{ artworkId: t('ID de obra vinculada', 'Linked artwork ID') }}
          save={values => change('addArtworkPhoto', { productId: product.id, ...values }, true)} />}
        <Button size="sm" kind="tertiary" disabled={busy || !detail.variants.length} onClick={() => {
          if (window.confirm(t('¿Enviar este producto a revisión?', 'Submit this product for review?'))) {
            change('reviewProduct', { productId: product.id, confirm: true }, true)
          }
        }}>{t('Enviar a revisión', 'Submit for review')}</Button>
      </>}
      <details className={styles.details}><summary>{t('Editar variantes, precios y aprobaciones','Edit variants, prices and approvals')}</summary>
      <h2>{t('Variantes', 'Variants')}</h2>
      {detail.variants.map(row => <article className={styles.item} key={row.id} id={'variant-'+row.id}>
        <strong>{row.title || row.sku}</strong><p>{row.fulfillment_type} · {row.inventory_policy} · {row.status}</p>
        {!product.legacy_source && <div className={styles.row}>
          <Button size="sm" kind="ghost" disabled={busy} onClick={()=>run(async()=>{
            const problems = await callCatalog('publicationStatus',{ variantId:row.id })
            setPublication(previous=>({ ...previous,[row.id]:problems }))
          })}>{t('Revisar requisitos','Check requirements')}</Button>
          {row.status !== 'active' && row.status !== 'archived' && ['approved','published','unpublished'].includes(product.status) &&
            <Button size="sm" disabled={busy || Boolean(publication[row.id]?.length)} onClick={()=>lifecycle('publish',row.id)}>{t('Publicar variante','Publish variant')}</Button>}
          {row.status === 'active' && <Button size="sm" kind="tertiary" disabled={busy} onClick={()=>lifecycle('unpublish',row.id)}>{t('Retirar variante','Unpublish variant')}</Button>}
        </div>}
        {publication[row.id] && (publication[row.id].length ? <ul>{publication[row.id].map(code=>
          <li key={code}>{publicationSections[code] ? <a href={'#'+publicationSections[code]+'-'+row.id}
            onClick={event=>openRequirement(event,event.currentTarget.hash.slice(1))}>{t(...publicationLabels[code])}</a>
            : code==='production_asset' && previewArtwork ? <Link href={'/admin/prints?artwork='+encodeURIComponent(previewArtwork.id)}>
              {t('Prepara el archivo privado en Artwork Prints para','Prepare the private file in Artwork Prints for')} {previewArtwork.sku} · {row.title || row.sku}
            </Link> : t(...(publicationLabels[code] || [code,code]))}</li>)}</ul>
          : <p role="status">{t('Cumple los requisitos comerciales.','Commercial checks passed.')}</p>)}
        {!product.legacy_source && <details id={'image-'+row.id} className={styles.details}>
          <summary>{t('Galería comercial verificada','Verified commercial gallery')}</summary>
          {imageFeedback[row.id]?.error && <p role="alert">{imageFeedback[row.id].error}</p>}
          {imageFeedback[row.id]?.status && <p role="status">{imageFeedback[row.id].status}</p>}
          <div className={styles.cols}>{commercialGallery(row).map(image=><div key={image.asset_id}>
            <OptimizedImg src={image.art_assets.public_url} alt={t(image.alt_es,image.alt_en)} sizes="240px" style={{ maxWidth:'100%',maxHeight:'14rem',objectFit:'contain' }} />
            {image.is_primary ? <p>{t('Imagen principal','Primary image')}</p> : row.status !== 'active' && <Button size="sm" kind="ghost" disabled={busy}
              onClick={()=>change('selectCommercialPrimary',{variantId:row.id,assetId:image.asset_id},true)}>{t('Usar como principal','Make primary')}</Button>}
            {!['active','archived'].includes(row.status) && <Button size="sm" kind="ghost" disabled={busy} onClick={()=>{
              if (window.confirm(t('¿Quitar la imagen de esta galería?', 'Remove this image from the gallery?'))) {
                change('removeCommercialImage',{variantId:row.id,assetId:image.asset_id},true)
              }
            }}>{t('Quitar de la galería','Remove from gallery')}</Button>}
          </div>)}</div>
          {!['active','archived'].includes(row.status) && <form className={styles.fields} onSubmit={event=>uploadGallery(event,row.id)}>
            <label>{t('Imagen JPG, PNG o WebP (hasta 4 MB)','JPG, PNG or WebP image (up to 4 MB)')}
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /></label>
            <TextInput id={'alt-es-'+row.id} name="altEs" labelText={t('Texto alternativo · ES','Alt text · ES')} required maxLength={240} />
            <TextInput id={'alt-en-'+row.id} name="altEn" labelText={t('Texto alternativo · EN','Alt text · EN')} required maxLength={240} />
            <Select id={'source-'+row.id} name="source" labelText={t('Origen','Source')}>
              <SelectItem value="admin" text={t('Fotografía o render propio','Studio photograph or render')} />
              <SelectItem value="jbu" text={t('Render de JBU','JBU render')} />
              <SelectItem value="provider" text={t('Imagen del proveedor','Supplier image')} />
            </Select>
            <Checkbox id={'primary-image-'+row.id} name="primary" labelText={t('Usar como imagen principal','Use as primary image')} defaultChecked={!commercialGallery(row).length} />
            <Checkbox id={'verified-image-'+row.id} name="confirmed" labelText={t('Verifiqué que la imagen representa esta variante y tengo permiso para utilizarla.','I verified this image represents the variant and I may use it.')} required />
            <Button type="submit" size="sm" disabled={busy}>{t('Subir imagen comercial','Upload commercial image')}</Button>
          </form>}
        </details>}
        {canEdit && <CatalogAction title={t('Reemplazar print abierto anterior','Replace previous open edition')}
          prefix={'replace-'+row.id} busy={busy} fields={{ printId:t('ID del print de la misma obra','Print ID from this artwork') }}
          initial={{ printId:row.replaces_print_id || '' }} optional={['printId']}
          save={values=>change('setLegacyReplacement',{ variantId:row.id,printId:values.printId || null },true)} />}
        {canEdit && row.fulfillment_type === 'manual' && <CatalogAction title={t('Asignar archivo de producción','Assign production file')}
          prefix={'production-'+row.id} busy={busy} fields={{ assetId:t('ID de derivado privado','Private derivative ID') }}
          save={values=>change('setProductionAsset',{variantId:row.id,assetId:values.assetId},true)} />}
        {row.wall_art_mockups?.source_url && <details className={styles.details}>
          <summary>{t('Mockups de arte mural', 'Wall art mockups')}</summary>
          <div className={styles.cols}>{row.wall_art_mockups.scenes.map(scene => <div key={scene}>
            <WallArtMockup image={row.wall_art_mockups.source_url} alt={detail.artworks[0]?.artworks.title || product.title_es}
              variant={{ widthMm: row.wall_art_mockups.width_mm, heightMm: row.wall_art_mockups.height_mm }}
              fit={row.wall_art_mockups.fit} scene={scene} />
            <p>{scene === 'gallery' ? t('Galería','Gallery') : t('Pared','Wall')}
              {row.wall_art_mockups.primary_scene === scene ? ' · ' + t('Principal','Primary') : ''}</p>
          </div>)}</div>
        </details>}
        {row.allowed_countries?.length > 0 && <p>{row.allowed_countries.join(', ')}</p>}
        {row.product_variant_attribute_values?.length > 0 && <ul>{row.product_variant_attribute_values.map(attr =>
          <li key={attr.attribute_code}>{attr.attribute_code} · {String(attr.text_value ?? attr.enum_value ?? attr.number_value ?? attr.boolean_value)}</li>)}</ul>}
        {(canEdit || product.legacy_source) && !detail.selections?.some(selection=>selection.product_variant_id===row.id) && <details><summary>{t('Vincular candidato manualmente','Link candidate manually')}</summary><CatalogAction title={t('Vincular candidato del proveedor', 'Link supplier candidate')}
          prefix={'candidate-' + row.id} busy={busy} fields={{ candidateId: t('ID de candidato de Product Studio', 'Product Studio candidate ID') }}
          save={values => change('linkProviderCandidate', { variantId: row.id, ...values }, true)} /></details>}
        <details id={'production-'+row.id}><summary>{t('Asignaciones de producción y validación','Production mappings and validation')}</summary>{row.provider_product_mappings?.map(mapping => <div key={mapping.id}>
          <p className={styles.mono}>{mapping.provider_code} · {mapping.external_variant_id} · {mapping.validation_status}</p>
          {!mapping.production_asset_id && previewArtwork && <p><Link href={'/admin/prints?artwork='+encodeURIComponent(previewArtwork.id)}>
            {t('Abrir Artwork Prints de esta versión','Open Artwork Prints for this version')}
          </Link></p>}
          {!mapping.enabled && !['active','archived'].includes(row.status) && <CatalogAction title={t('Validar asignación de producción', 'Validate production mapping')}
            prefix={'mapping-' + mapping.id} busy={busy}
            key={mapping.production_asset_id || mapping.id}
            fields={{ assetId: t('ID del archivo privado de producción', 'Private production file ID'),
              countries: t('Países permitidos (separados por comas)', 'Allowed countries (comma-separated)') }}
            submitLabel={t('Validar asignación','Validate mapping')}
            initial={{ assetId:mapping.production_asset_id || '', countries:row.allowed_countries?.join(', ') }}
            confirm={t('¿Confirmas que el proveedor usa una sola área predeterminada y que este archivo corresponde a ella?',
              'Confirm that the supplier uses one default print area and this file matches it?')}
            save={values => change('enableMapping', { mappingId: mapping.id, assetId: values.assetId,
              countries: splitCountries(values.countries), verifiedSingleDefaultArea: true, confirm: true }, true)} />}
        </div>)}</details>
        {!product.legacy_source && !['active','archived'].includes(row.status) && <CatalogAction title={t('Editar destinos', 'Edit destinations')} prefix={'countries-' + row.id} busy={busy}
          fields={{ countries: t('Países permitidos (separados por comas)', 'Allowed countries (comma-separated)') }}
          initial={{ countries: row.allowed_countries?.join(', ') }} optional={['countries']}
          save={values => change('setVariantCountries', { variantId: row.id, countries: splitCountries(values.countries) }, true)} />}
        {canEdit && <details className={styles.details}>
          <summary>{t('Configurar atributo', 'Configure attribute')}</summary>
          {detail.selections?.some(selection=>selection.product_variant_id===row.id && selection.product_discovery_candidates?.catalog_snapshot?.presentation?.version) ? <p>{t('La configuración del fabricante se conserva. Para cambiar tamaño o material, selecciona otra configuración en Product Studio.','Supplier configuration is preserved. To change size or material, select another configuration in Product Studio.')}</p> : <AttributeForm attributes={detail.attributes} variantId={row.id} busy={busy} save={input => change('setVariantAttribute', input, true)} />}
        </details>}
        <div id={'price-'+row.id}><ul>{row.price_book_entries?.map(entry => {
          const book = list?.books.find(book => book.id === entry.price_book_id)
          return <li key={entry.id} className={styles.row}>
            {book?.currency
              ? new Intl.NumberFormat(lang,{style:'currency',currency:book.currency,currencyDisplay:'code'}).format(entry.amount_minor / 10 ** wallArtMoney(book.currency))
              : entry.amount_minor} · {book?.name} · {t('Precio','Price')} {t(...(priceStatuses[entry.status] || [entry.status,entry.status]))}
            {book && ` · ${t('Lista','Book')} ${t(...(priceStatuses[book.status] || [book.status,book.status]))}`}
            {entry.status === 'active' && book?.status === 'draft' && <Button kind="ghost" size="sm" disabled={busy} onClick={() => {
              if (window.confirm(t('¿Activar la lista con sus precios aprobados?', 'Activate the book with its approved prices?'))) {
                change('activateBook', { bookId: book.id, confirm: true }, true)
              }
            }}>{t('Activar lista', 'Activate book')}</Button>}
            {entry.status === 'draft' && <Button kind="ghost" size="sm" disabled={busy} onClick={() => {
              if (window.confirm(t('¿Aprobar este precio?', 'Approve this price?'))) {
                change('approvePrice', { entryId: entry.id, confirm: true }, true)
              }
            }}>{t('Aprobar precio', 'Approve price')}</Button>}
          </li>
        })}</ul>
        {!product.legacy_source && !['active','archived'].includes(row.status) && <details className={styles.details}>
          <summary>{t('Crear precio borrador', 'Create draft price')}</summary>
          <form className={styles.fields} onSubmit={event => {
            event.preventDefault()
            const bookId = named(event,'book')
            const book = list?.books.find(book=>book.id===bookId)
            if (!book) return
            const amountMinor = Math.round(Number(named(event,'amount')) * 10 ** wallArtMoney(book.currency))
            change('addPriceDraft',{ variantId:row.id,bookId,amountMinor },true)
          }}>
            <BookSelect books={list?.books || []} id={'book-' + row.id} />
            <TextInput id={'amount-' + row.id} name="amount" labelText={t('Importe en la moneda de la lista', 'Amount in the price book currency')}
              helperText={t('Para cobrar 900 MXN, escribe 900.', 'To charge 900 MXN, enter 900.')}
              type="number" min="0" step="any" required />
            <Button type="submit" kind="tertiary" disabled={busy}>{t('Guardar borrador de precio', 'Save draft price')}</Button>
          </form>
        </details>}
        </div>
      </article>)}
      </details>
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

function CatalogAction({ title, prefix, fields, initial = {}, optional = [], confirm, submitLabel, busy, save }) {
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
      <Button type="submit" size="sm" kind="tertiary" disabled={busy}>{submitLabel || t('Guardar', 'Save')}</Button>
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

function commercialGallery(row) {
  return (row.product_variant_assets || []).filter(item => item.role==='gallery' && item.verified_at && item.art_assets?.public_url)
    .sort((a,b)=>Number(b.is_primary)-Number(a.is_primary))
}
const priceStatuses = { draft:['borrador','draft'],active:['activo','active'],archived:['archivado','archived'] }
const publicationSections = {image:'image',provider_mapping:'production',price_mx:'price',price:'price'}
const publicationLabels = {
  artwork:['Vincula una obra pública con reproducciones habilitadas.','Link a public artwork with reproductions enabled.'],
  descriptions:['Completa los títulos y descripciones en ambos idiomas.','Complete titles and descriptions in both languages.'],
  configuration:['Configura el tamaño o las dimensiones de la variante.','Configure the variant size or dimensions.'],
  inventory:['Usa inventario bajo pedido y preparación física.','Use made-to-order physical fulfillment.'],
  destinations:['Configura los destinos disponibles.','Configure available destinations.'],
  legacy_mapping:['Revisa la relación con el print anterior.','Review the previous print mapping.'],
  image:['Sube y verifica una imagen comercial principal.','Upload and verify a primary commercial image.'],
  production_asset:['Asigna un derivado privado de producción listo.','Assign a ready private production derivative.'],
  provider_mapping:['Valida la asignación y sus destinos con el fabricante.','Validate the supplier mapping and its destinations.'],
  price_mx:['Aprueba un precio para México en una lista activa y verifica el destino y el envío a México.','Approve a Mexico price in an active price book and verify the destination and shipping to Mexico.'],
  price:['Aprueba un precio en una lista activa en MXN o USD y verifica que haya envío configurado.','Approve a price in an active MXN or USD price book and verify shipping is configured.'],
}
