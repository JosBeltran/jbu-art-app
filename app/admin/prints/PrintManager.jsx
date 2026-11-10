'use client'

/* eslint-disable @next/next/no-img-element -- Admin thumbnails use existing public artwork media URLs. */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Checkbox, ComboBox, InlineLoading, InlineNotification, Link, Pagination, Search,
  Select, SelectItem, Tag, TextArea, TextInput, Tile,
} from '@carbon/react'
import PrintAssetGenerator from '@/components/admin/PrintAssetGenerator'
import PrintProductionPanel, { printProductionLabel } from '@/components/admin/PrintProductionPanel'
import { Add } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import ImageUploader from '@/app/admin/artworks/components/ImageUploader'
import { authHeaders } from '@/lib/authHeaders'
import { firstFlaggedPrintImage } from '@/lib/printImages'
import { nextPrintForm, printForm, PRINT_EDITIONS, PRINT_FINISHES } from '@/lib/printManager'
import styles from './PrintManager.module.css'

async function requestPrints(query = '', options = {}) {
  const response = await fetch('/api/admin/prints' + query, {
    ...options,
    headers: { ...await authHeaders(), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  return data
}

function errorText(error, t) {
  const messages = {
    duplicate_print_sku: t('Este SKU ya está en uso.', 'This SKU is already in use.'),
    invalid_print_image: t('Selecciona una imagen pública de la obra o sube una imagen.', 'Choose a public artwork image or upload an image.'),
    required_print_fields: t('Escribe el título y el tamaño del print.', 'Enter the print title and size.'),
    invalid_print_price: t('Escribe un precio positivo con hasta dos decimales.', 'Enter a positive price with up to two decimal places.'),
    invalid_print_edition_size: t('Indica el total de ejemplares de la edición limitada.', 'Enter the total number of copies in the limited edition.'),
    invalid_print_inventory: t('Revisa el límite de la edición y las unidades vendidas.', 'Check the edition limit and units already sold.'),
    invalid_print_sort: t('El orden debe ser un número entero positivo o cero.', 'Sort order must be zero or a positive integer.'),
    invalid_print_currency: t('La moneda base de los prints es MXN.', 'The base currency for prints is MXN.'),
    print_retry_conflict: t('El print ya se guardó con otros valores. Cierra el formulario y vuelve a cargar la lista.', 'This print was saved with different values. Close the form and reload the list.'),
    print_specs_locked: t('Para modificar la imagen o el papel, guarda una nueva revisión de la vista previa.', 'To change the image or paper, save a new preview revision.'),
    print_parent_disabled: t('Habilita “Disponible para impresiones” en la ficha de la versión anterior y guarda la obra antes de publicar el print.', 'Enable “Available for prints” on the earlier version and save the artwork before publishing the print.'),
    print_identity_locked: t('Duplica el print para cambiar la obra o el tipo de edición.', 'Duplicate the print to change its artwork or edition type.'),
    unauthorized: t('Vuelve a iniciar sesión.', 'Sign in again.'),
    forbidden: t('Se requiere el rol de administrador.', 'The administrator role is required.'),
  }
  return messages[error] || t('No se pudo completar la operación. Revisa los datos y vuelve a intentar.', 'The operation could not be completed. Check the values and try again.')
}

function PrintForm({ editor, setEditor, artworks, byArtwork, onSave, onClose, busy, t }) {
  const { fields, create, locked } = editor
  const [media, setMedia] = useState(null)
  const [mediaError, setMediaError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const parent = byArtwork.get(fields.artwork_id)
  const label = item => item ? [item.title, item.title_en !== item.title && item.title_en, item.sku].filter(Boolean).join(' · ') : ''
  const change = values => setEditor(previous => ({ ...previous, fields: { ...previous.fields, ...values } }))

  useEffect(() => {
    if (!fields.artwork_id) return
    const controller = new AbortController()
    const artworkId = fields.artwork_id
    requestPrints('?artwork=' + encodeURIComponent(artworkId), { signal: controller.signal }).then(result => {
      setMedia({ ...result, artworkId })
      setMediaError(false)
    }).catch(() => {
      if (!controller.signal.aborted) {
        setMedia({ artworkId })
        setMediaError(true)
      }
    })
    return () => controller.abort()
  }, [fields.artwork_id])

  const mediaCurrent = media?.artworkId === fields.artwork_id
  const gallery = mediaCurrent ? media.gallery || [] : []
  const provenance = mediaCurrent ? media.provenance || [] : []
  const images = [
    ...(parent?.primary_image_url ? [{ key: 'primary', url: parent.primary_image_url, label: t('Imagen principal de la obra', 'Artwork primary image') }] : []),
    ...gallery.map((row, i) => ({ key: 'gallery:' + row.id, url: row.image_url, label: t('Galería', 'Gallery') + ' ' + (i + 1) })),
    ...provenance.filter(row => row.image_url).map((row, i) => ({ key: 'provenance:' + row.id, url: row.image_url, label: t('Procedencia pública', 'Public provenance') + ' ' + (i + 1) })),
  ]
  const preview = fields.image_key === 'upload' ? fields.image_url :
    images.find(image => image.key === fields.image_key)?.url ||
    firstFlaggedPrintImage(gallery) || parent?.primary_image_url
  const unavailable = Boolean(fields.image_key && fields.image_key !== 'upload' &&
    !images.some(image => image.key === fields.image_key))
  const disabled = busy || uploading
  const parentPrintsDisabled = fields.is_active && parent?.is_historical_version && parent.allows_prints !== true
  const field = (key, title, props = {}) => <TextInput id={'print-' + key} labelText={title}
    value={fields[key]} onChange={event => change({ [key]: event.target.value })} {...props} />

  return (
    <Tile className={styles.editor}>
      <h2>{create ? t('Nuevo print', 'New print') : t('Editar print', 'Edit print')}</h2>
      <form onSubmit={event => {
        event.preventDefault()
        if (disabled || parentPrintsDisabled) return
        onSave(event.nativeEvent.submitter?.value || 'close')
      }}>
        <fieldset disabled={disabled} className={styles.fieldset}>
          <ComboBox id="print-artwork" titleText={t('Obra original', 'Parent artwork')}
            placeholder={t('Buscar por título o SKU', 'Search by title or SKU')}
            items={artworks} selectedItem={parent || null} itemToString={label}
            itemToElement={item => <span className={styles.option}>
              {item.primary_image_url && <img className={styles.icon} src={item.primary_image_url} alt="" />}
              {label(item)}
            </span>}
            shouldFilterItem={({ item, inputValue }) => label(item).toLowerCase().includes((inputValue || '').toLowerCase())}
            disabled={!create} onChange={({ selectedItem }) => {
              const id = selectedItem?.id || ''
              if (id !== fields.artwork_id) change({ artwork_id: id, image_key: '', image_url: '' })
            }} />
          {!create && <p>{t('Para cambiar la obra o el tipo de edición, duplica esta variante.', 'Duplicate this variant to change its artwork or edition type.')}</p>}
          <div className={styles.fields}>
            {field('title', t('Título comercial (ES)', 'Commercial title (ES)'), { required: true, maxLength: 200 })}
            {field('title_en', t('Título comercial (EN)', 'Commercial title (EN)'), { maxLength: 200 })}
            <TextArea id="print-description" labelText={t('Descripción (ES)', 'Description (ES)')}
              value={fields.description} maxLength={10000} onChange={event => change({ description: event.target.value })} />
            <TextArea id="print-description-en" labelText={t('Descripción (EN)', 'Description (EN)')}
              value={fields.description_en} maxLength={10000} onChange={event => change({ description_en: event.target.value })} />
            <Select id="print-edition" labelText={t('Tipo de edición', 'Edition type')} value={fields.edition_type}
              disabled={!create} onChange={event => change({ edition_type: event.target.value })}>
              <SelectItem value="OPEN" text={t('Abierta', 'Open Edition')} />
              <SelectItem value="LIMITED" text={t('Limitada', 'Limited Edition')} />
            </Select>
            {fields.edition_type === 'LIMITED' && field('max_edition_size', t('Tiraje total', 'Edition size'),
              { type: 'number', required: true, min: 1, step: 1 })}
            {field('size', t('Tamaño o medidas', 'Size or dimensions'), { required: true, disabled: locked, maxLength: 120, placeholder: 'A3 · 29.7 × 42 cm' })}
            <Select id="print-finish" labelText={t('Acabado', 'Finish')} value={fields.finish} disabled={locked}
              onChange={event => change({ finish: event.target.value })}>
              {PRINT_FINISHES.map((value, i) => <SelectItem key={value} value={value}
                text={[t('Papel Fine Art', 'Fine Art Paper'), t('Lienzo', 'Canvas'), t('Brillante', 'Gloss'), t('Mate', 'Matte'), t('Resina', 'Resin')][i]} />)}
            </Select>
            {field('paper_type', t('Papel', 'Paper'), { maxLength: 200, disabled: locked })}
            {field('framing', t('Enmarcado', 'Framing'), { maxLength: 200 })}
            {field('price', t('Precio base', 'Base price'), { type: 'number', required: true, min: '0.01', step: '0.01' })}
            <Select id="print-currency" labelText={t('Moneda base', 'Base currency')} value={fields.currency} disabled>
              <SelectItem value="MXN" text="MXN" />
            </Select>
            {field('sku', 'SKU', { maxLength: 100 })}
            {field('sort_order', t('Orden de presentación', 'Display order'), { type: 'number', min: 0, step: 1 })}
          </div>
          {parent && !locked && <div className={styles.media}>
            <Select id="print-image" labelText={t('Imagen del print', 'Print image')} value={fields.image_key}
              onChange={event => change({ image_key: event.target.value })}>
              <SelectItem value="" text={t('Automática', 'Automatic')} />
              {unavailable && <SelectItem value={fields.image_key} text={t('Referencia guardada', 'Saved reference')} />}
              {images.map(image => <SelectItem key={image.key} value={image.key} text={image.label} />)}
              <SelectItem value="upload" text={t('Imagen cargada', 'Uploaded image')} />
            </Select>
            {!mediaCurrent && <InlineLoading description={t('Cargando imágenes…', 'Loading images…')} />}
            {mediaCurrent && mediaError && <p role="alert">{t('No se pudieron cargar las imágenes de galería y procedencia.', 'Gallery and provenance images could not be loaded.')}</p>}
            {fields.image_key === 'upload' ?
              <ImageUploader key={fields.artwork_id} currentUrl={fields.image_url} pathPrefix="artwork-images/prints" strictImageTypes
                onUploadStateChange={setUploading}
                onUploadComplete={url => change({ image_url: url })} /> :
              preview && <img className={styles.preview} src={preview} alt={t('Vista previa del print', 'Print preview')} />}
          </div>}
          <Checkbox id="print-active" checked={fields.is_active} labelText={t('Publicar al guardar', 'Publish on save')}
            onChange={(_event, { checked }) => change({ is_active: checked })} />
          {parentPrintsDisabled && <p role="alert">
            {errorText('print_parent_disabled', t)}{' '}
            <Link href={'/admin/artworks/' + parent.id + '/edit'}>{t('Editar versión', 'Edit version')}</Link>
          </p>}
          {fields.is_active && parent && !parent.is_historical_version && parent.allows_prints !== true && <p>{t(
            'Publicar también habilita las impresiones de esta obra.',
            'Publishing also enables prints for this artwork.'
          )}</p>}
          <div className={styles.actions}>
            <Button type="submit" value="close" disabled={!parent || disabled || parentPrintsDisabled}>{t('Guardar y cerrar', 'Save and close')}</Button>
            <Button type="submit" kind="secondary" value="another" disabled={!parent || disabled || parentPrintsDisabled}>{t('Guardar y agregar otro', 'Save and add another')}</Button>
            <Button type="submit" kind="secondary" value="duplicate" disabled={!parent || disabled || parentPrintsDisabled}>{t('Guardar y duplicar', 'Save and duplicate')}</Button>
            <Button type="button" kind="ghost" onClick={onClose}>{t('Cancelar', 'Cancel')}</Button>
          </div>
        </fieldset>
      </form>
    </Tile>
  )
}

export default function PrintManager({ initialArtwork, initialVariant }) {
  const { t, locale } = useI18n()
  const [data, setData] = useState({ variants: [], artworks: [] })
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null)
  const [production, setProduction] = useState(null)
  const [generator, setGenerator] = useState(null)
  const [busy, setBusy] = useState(false)
  const submission = useRef(false)
  const editorAnchor = useRef(null)
  const [notice, setNotice] = useState(null)
  const [query, setQuery] = useState('')
  const [edition, setEdition] = useState('')
  const [size, setSize] = useState('')
  const [status, setStatus] = useState('')
  const [parentFilter, setParentFilter] = useState(initialArtwork)
  const [pagination, setPagination] = useState({ page: 1, pageSize: 12 })
  const byArtwork = useMemo(() => new Map(data.artworks.map(a => [a.id, a])), [data.artworks])
  const sizes = [...new Set(data.variants.map(v => v.size).filter(Boolean))].sort()
  const filtered = data.variants.filter(v => {
    const parent = byArtwork.get(v.artwork_id)
    const searchable = [v.title, v.title_en, v.sku, parent?.title, parent?.title_en, parent?.sku].filter(Boolean).join(' ').toLowerCase()
    return searchable.includes(query.trim().toLowerCase()) && (!edition || v.edition_type === edition) &&
      (!size || v.size === size) && (!status || v.is_active === (status === 'active')) &&
      (!parentFilter || v.artwork_id === parentFilter)
  })
  const { pageSize } = pagination
  const page = Math.min(pagination.page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    const controller = new AbortController()
    requestPrints('', { signal: controller.signal }).then(result => {
      setData(result)
      const variant = initialVariant && result.variants.find(row => row.id === initialVariant)
      if (variant) setEditor({
        id: variant.id, create: false, locked: variant.production?.layout?.algorithmVersion === 1, fields: printForm(variant, result.artworks.find(row => row.id === variant.artwork_id)),
      })
    }).catch(error => {
      if (!controller.signal.aborted) setNotice({ error: error.message })
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initialVariant])

  useEffect(() => { if (editor?.id) editorAnchor.current?.focus() }, [editor?.id])

  function open(row, duplicate = false) {
    const fields = printForm(row, byArtwork.get(row?.artwork_id || parentFilter))
    setNotice(null)
    setEditor({
      id: row && !duplicate ? row.id : crypto.randomUUID(), create: !row || duplicate,
      locked: !duplicate && row?.production?.layout?.algorithmVersion === 1,
      fields: duplicate ? nextPrintForm(fields, true) : fields,
    })
  }

  async function persist(current, action) {
    if (submission.current) return
    submission.current = true
    setBusy(true)
    setNotice(null)
    try {
      const deactivating = action === 'deactivate'
      await requestPrints('', {
        method: deactivating ? 'PATCH' : 'POST',
        body: JSON.stringify(deactivating ? { id: current.id } : { ...current.fields, id: current.id, create: current.create }),
      })
      if (!deactivating) setEditor(action === 'close' ? null : {
        id: crypto.randomUUID(), create: true, fields: nextPrintForm(current.fields, action === 'duplicate'),
      })
      setNotice({ saved: true })
      try {
        setData(await requestPrints())
      } catch (error) {
        setNotice({ saved: true, error: error.message })
      }
    } catch (error) {
      setNotice({ error: error.message })
      editorAnchor.current?.focus()
    } finally {
      submission.current = false
      setBusy(false)
    }
  }

  const filter = setter => event => {
    setter(event.target.value)
    setPagination(previous => ({ ...previous, page: 1 }))
  }

  return <section className={styles.root}>
    <div className={styles.header}>
      <h1>{t('Administrar Fine Art Prints', 'Fine Art Prints Manager')}</h1>
      <Button renderIcon={Add} onClick={() => open()} disabled={loading || busy || Boolean(editor)}>{t('Nuevo print', 'New print')}</Button>
    </div>
    <div ref={editorAnchor} tabIndex={-1}>
      {notice?.saved && <InlineNotification lowContrast kind="success" title={t('Print guardado', 'Print saved')}
        onClose={() => setNotice(null)} />}
      {notice?.error && <InlineNotification lowContrast kind="error"
        title={notice.saved ? t('No se pudo actualizar la lista', 'Could not refresh the list') : t('Revisa la operación', 'Check this operation')}
        subtitle={errorText(notice.error, t)} onClose={() => setNotice(null)} />}
      {editor && <PrintForm key={editor.id} editor={editor} setEditor={setEditor} artworks={data.artworks}
        byArtwork={byArtwork} onSave={action => persist(editor, action)} onClose={() => setEditor(null)} busy={busy} t={t} />}
    </div>
    <div className={styles.filters}>
      <Search id="print-search" labelText={t('Buscar prints', 'Search prints')}
        placeholder={t('Título, obra o SKU', 'Title, artwork or SKU')} value={query} onChange={filter(setQuery)} />
      <Select id="print-filter-edition" labelText={t('Edición', 'Edition')} value={edition} onChange={filter(setEdition)}>
        <SelectItem value="" text={t('Todas', 'All')} />
        {PRINT_EDITIONS.map(e => <SelectItem key={e} value={e} text={e === 'OPEN' ? t('Abierta', 'Open') : t('Limitada', 'Limited')} />)}
      </Select>
      <Select id="print-filter-size" labelText={t('Tamaño', 'Size')} value={size} onChange={filter(setSize)}>
        <SelectItem value="" text={t('Todos', 'All')} />
        {sizes.map(value => <SelectItem key={value} value={value} text={value} />)}
      </Select>
      <Select id="print-filter-status" labelText={t('Estado', 'Status')} value={status} onChange={filter(setStatus)}>
        <SelectItem value="" text={t('Todos', 'All')} />
        <SelectItem value="active" text={t('Activo', 'Active')} />
        <SelectItem value="inactive" text={t('Inactivo', 'Inactive')} />
      </Select>
    </div>
    {parentFilter && <Button kind="ghost" size="sm" onClick={() => setParentFilter('')}>
      {t('Quitar filtro de obra', 'Clear artwork filter')} · {byArtwork.get(parentFilter)?.title}
    </Button>}
    {parentFilter && <Button kind="secondary" size="sm" onClick={() => setGenerator(generator === parentFilter ? null : parentFilter)}>
      {t('Generar vista previa o máster', 'Generate preview or master')}
    </Button>}
    {generator && <Tile>
      <div className={styles.actions}><h3>{byArtwork.get(generator)?.title}</h3>
        <Button kind="ghost" size="sm" onClick={() => {
          setGenerator(null)
          requestPrints().then(setData).catch(error => setNotice({ error: error.message }))
        }}>{t('Cerrar generador', 'Close generator')}</Button>
      </div>
      <PrintAssetGenerator key={generator} artworkId={generator} />
    </Tile>}
    {loading ? <InlineLoading description={t('Cargando prints…', 'Loading prints…')} /> : !visible.length ?
      <p>{t('No hay variantes que coincidan con los filtros.', 'No variants match these filters.')}</p> :
      <ul className={styles.list}>
        {visible.map(row => {
          const parent = byArtwork.get(row.artwork_id)
          return <li key={row.id}>
            <Tile className={styles.row}>
              <div className={styles.thumbnail}>{row.thumbnail && <img src={row.thumbnail} alt="" loading="lazy" />}</div>
              <div className={styles.details}>
                <h3>{t(row.title || parent?.title || row.size, row.title_en || row.title || parent?.title_en || parent?.title || row.size)}</h3>
                <p>{parent?.title} {parent?.is_historical_version && t('(versión histórica)', '(historical version)')} · {row.size} · {row.sku || '—'}</p>
                <Tag type={row.is_active ? 'green' : 'gray'}>{row.is_active ? t('Activo', 'Active') : t('Inactivo', 'Inactive')}</Tag>
                {row.production && <Tag type="cool-gray">{printProductionLabel(row.production.production_status, t)} · {Math.round(row.production.effective_dpi)} DPI</Tag>}
                <Tag type="purple">{row.edition_type === 'LIMITED' ? t('Limitada', 'Limited') : t('Abierta', 'Open')}</Tag>
              </div>
              <p>{new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(row.price)} {row.currency || 'MXN'}</p>
              <div className={styles.actions}>
                {row.production && <Button kind="ghost" size="sm" onClick={() => setProduction(production === row.id ? null : row.id)}>
                  {t('Preparación y especificaciones', 'Preparation and specifications')}
                </Button>}
                <Button kind="ghost" size="sm" onClick={() => setGenerator(row.artwork_id)}>
                  {t('Generador de la obra', 'Artwork generator')}
                </Button>
                <Button kind="ghost" size="sm" disabled={busy || Boolean(editor)} onClick={() => open(row)}>{t('Editar', 'Edit')}</Button>
                <Button kind="ghost" size="sm" disabled={busy || Boolean(editor)} onClick={() => open(row, true)}>{t('Duplicar', 'Duplicate')}</Button>
                <Button kind="ghost" size="sm" disabled={busy || Boolean(editor)} onClick={() => {
                  if (row.is_active) void persist({ id: row.id }, 'deactivate')
                  else {
                    open(row)
                    setEditor(previous => ({ ...previous, fields: { ...previous.fields, is_active: true } }))
                  }
                }}>{row.is_active ? t('Desactivar', 'Deactivate') : t('Activar', 'Activate')}</Button>
              </div>
            </Tile>
            {production === row.id && <PrintProductionPanel key={row.id} variant={row.id}
              artworkEdit={'/admin/artworks/' + row.artwork_id + '/edit#print-assets'}
              onChange={() => { requestPrints().then(setData).catch(error => setNotice({ error: error.message })) }} />}
          </li>
        })}
      </ul>}
    {filtered.length > 12 && <Pagination page={page} pageSize={pageSize} pageSizes={[12, 24, 48]}
      totalItems={filtered.length} onChange={setPagination} itemsPerPageText={t('Por página', 'Per page')} />}
  </section>
}
