'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button, InlineLoading, Modal, OverflowMenu, OverflowMenuItem, Select, SelectItem, Tag, TextInput } from '@carbon/react'
import { Add, Image as ImageIcon } from '@carbon/icons-react'
import AdminDataGrid from '@/components/admin/AdminDataGrid'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import {
  AVAILABILITY_TARGETS, defaultLayout, defaultQuery, FILTER_KEYS, GROUP_KEYS, INVENTORY_PATH,
  inventoryArtworkTitle, inventoryParams, inventoryThumbnail, PAGE_SIZES, parseInventoryQuery, SORT_KEYS,
} from '@/lib/adminArtworkInventory'
import styles from './ArtworksList.module.css'

const API = '/api/admin/artworks/inventory'
const emptyPreferences = { layout: defaultLayout, views: [] }
const statusColors = { AVAILABLE: 'green', SOLD: 'purple', RESERVED: 'magenta', NOT_FOR_SALE: 'cool-gray', DRAFT: 'gray', OWNED: 'teal' }

function inventoryScrollKey(user, url) {
  return 'jbu:admin:artwork-inventory:scroll:v1:' + user + ':' + url
}

function Thumbnail({ sources, missing }) {
  const [attempt, setAttempt] = useState(0)
  const source = sources?.[attempt]
  return <span className={styles.thumb}>
    {source ? (
      // eslint-disable-next-line @next/next/no-img-element -- Fixed inventory optimizer presets.
      <img src={inventoryThumbnail(source, 96)} srcSet={inventoryThumbnail(source, 96) + ' 1x, ' + inventoryThumbnail(source, 128) + ' 2x'}
        width="48" height="48" alt="" loading="lazy" decoding="async" onError={() => setAttempt(value => value + 1)} />
    ) : <span title={missing} role="img" aria-label={missing}><ImageIcon size={16} /></span>}
  </span>
}

function Inventory() {
  const { t, savePreference } = useI18n()
  const params = useSearchParams()
  const query = parseInventoryQuery(params)
  const url = INVENTORY_PATH + '?' + inventoryParams(query)
  const requestKey = inventoryParams(query, false).toString()
  const [draftSearch, setDraftSearch] = useState({ base: query.search, text: query.search })
  const search = draftSearch.base === query.search ? draftSearch.text : query.search
  const [result, setResult] = useState(null)
  const [failure, setFailure] = useState(null)
  const [facets, setFacets] = useState({})
  const [revision, setRevision] = useState(0)
  const [administrator, setAdministrator] = useState('')
  const [preferences, setPreferences] = useState(emptyPreferences)
  const [viewName, setViewName] = useState('')
  const [selection, setSelection] = useState({ key: '', ids: new Set() })
  const [bulk, setBulk] = useState(null)
  const [report, setReport] = useState(null)
  const [notice, setNotice] = useState(null)
  const scrollPositionRef = useRef(null)
  const writePreferences = useRef(Promise.resolve())
  const loadedFacets = useRef(false)
  const restoredScroll = useRef(false)
  const requestId = requestKey + ':' + revision

  function changeQuery(patch) {
    const current = parseInventoryQuery(new URLSearchParams(window.location.search))
    const next = INVENTORY_PATH + '?' + inventoryParams({ ...current, ...patch })
    if (next !== window.location.pathname + window.location.search) window.history.replaceState(null, '', next)
  }

  useEffect(() => {
    if (query.search === search) return
    const timeout = setTimeout(() => {
      const current = parseInventoryQuery(new URLSearchParams(window.location.search))
      if (current.search !== query.search) return
      window.history.replaceState(null, '', INVENTORY_PATH + '?' + inventoryParams({ ...current, search, page: 1 }))
    }, 300)
    return () => clearTimeout(timeout)
  }, [search, query.search])

  useEffect(() => {
    const controller = new AbortController()
    const includeFacets = !loadedFacets.current
    async function load() {
      try {
        const response = await fetch(API + '?' + requestKey + (includeFacets ? '&facets=1' : ''), {
          headers: await authHeaders(), signal: controller.signal,
        })
        const data = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) throw new Error(data.error)
        if (data.facets) {
          setFacets(data.facets)
          loadedFacets.current = true
        }
        if (!restoredScroll.current) {
          restoredScroll.current = true
          const current = parseInventoryQuery(new URLSearchParams(window.location.search))
          const currentUrl = INVENTORY_PATH + '?' + inventoryParams(current)
          try { scrollPositionRef.current = JSON.parse(sessionStorage.getItem(inventoryScrollKey(data.administrator, currentUrl))) } catch {}
          setPreferences(data.preferences || emptyPreferences)
        }
        setAdministrator(data.administrator)
        const current = parseInventoryQuery(new URLSearchParams(window.location.search))
        const lastPage = Math.max(1, Math.ceil(data.total / current.size))
        if (current.page > lastPage && inventoryParams(current, false).toString() === requestKey) {
          window.history.replaceState(null, '', INVENTORY_PATH + '?' + inventoryParams({ ...current, page: lastPage }))
          return
        }
        setResult({ ...data, key: requestId })
        setFailure(null)
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ key: requestId, code: error.message })
      }
    }
    void load()
    return () => controller.abort()
  }, [requestKey, requestId])

  const labels = {
    title: t('Obra / SKU', 'Artwork / SKU'), thumbnail: t('Imagen', 'Image'), sku: 'SKU',
    series: t('Serie', 'Series'), year: t('Año', 'Year'), medium: t('Medio / técnica', 'Medium / technique'),
    status: t('Estado del catálogo', 'Catalog status'), availability: t('Disponibilidad', 'Availability'),
    ownership: t('Estado de propiedad', 'Ownership status'), edition: t('Tipo de obra / edición física', 'Artwork type / physical edition'),
    version: t('Versión', 'Version'), prints: t('Prints disponibles', 'Available prints'),
    price: t('Precio base (MXN)', 'Base price (MXN)'), owner: t('Propietario', 'Owner'),
    token: t('Token de verificación', 'Verification token'),
    created_at: t('Fecha de registro', 'Date added'), updated_at: t('Último cambio', 'Last updated'),
  }
  const valueLabels = {
    AVAILABLE: t('Disponible', 'Available'), NOT_FOR_SALE: t('No a la venta', 'Not for sale'),
    SOLD: t('Vendida', 'Sold'), OWNED: t('Con propietario', 'Owned'), RESERVED: t('Reservada', 'Reserved'),
    DRAFT: t('Borrador', 'Draft'), UNIQUE: t('Única', 'Unique'), LIMITED_EDITION: t('Limitada', 'Limited edition'),
    historical: t('Versión anterior', 'Previous version'), current: t('Actual', 'Current'),
    draft: t('Sucesora en borrador', 'Draft successor'), true: t('Sí', 'Yes'), false: t('No', 'No'),
  }
  const display = value => Object.hasOwn(valueLabels, value) ? valueLabels[value] : value || '—'
  const locale = t('es-MX', 'en-US')
  const artworkTitle = row => inventoryArtworkTitle(t(row.title, row.title_en || row.title), row.version) || row.sku || row.id
  const editHref = (row, anchor = '') => INVENTORY_PATH + '/' + row.id + '/edit?' + new URLSearchParams({ inventory: url }) + anchor
  const renderStatus = value => value ? <Tag type={statusColors[value] || 'cool-gray'} size="sm">{display(value)}</Tag> : '—'
  const formatDate = value => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value)) : '—'
  const renderers = {
    title: row => <div className={styles.identification}>
      <Link prefetch={false} href={editHref(row)} className={styles.titleLink}>{artworkTitle(row)}</Link>
      <span className={styles.secondary}>{row.sku}</span>
      {row.version !== 'current' && <Tag size="sm" type="purple">{display(row.version)}</Tag>}
    </div>,
    thumbnail: row => <Thumbnail key={row.thumbnails.join() || 'missing'} sources={row.thumbnails} missing={t('Sin imagen', 'No image')} />,
    status: row => renderStatus(row.status),
    availability: row => renderStatus(row.availability),
    ownership: row => renderStatus(row.ownership),
    edition: row => display(row.edition),
    version: row => display(row.version),
    price: row => row.price == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN' }).format(row.price),
    owner: row => <div className={styles.identification}>{row.owner || '—'}{row.owner_email && <span className={styles.secondary}>{row.owner_email}</span>}</div>,
    created_at: row => formatDate(row.created_at),
    updated_at: row => formatDate(row.updated_at),
  }
  const columns = Object.entries(labels).map(([id, label]) => ({
    id, label, value: row => row[id], render: renderers[id], required: id === 'title',
    numeric: ['price', 'year', 'prints'].includes(id), sortable: SORT_KEYS.includes(id),
    groupable: GROUP_KEYS.includes(id), groupLabel: ['status', 'edition'].includes(id) ? display : undefined,
  }))
  const filters = FILTER_KEYS.map(id => ({
    id, label: labels[id], options: facets[id] || [],
    display: ['series', 'medium', 'year'].includes(id) ? value => value : display,
  }))
  const builtInViews = [
    { id: 'all', name: t('Todas las obras', 'All artworks'), filters: {} },
    { id: 'originals', name: t('Obras originales', 'Original artworks'), filters: { version: ['current'] } },
    { id: 'available', name: t('Obras disponibles', 'Available artworks'), filters: { availability: ['AVAILABLE'], version: ['current'] } },
    { id: 'sold', name: t('Obras vendidas', 'Sold artworks'), filters: { availability: ['SOLD'] } },
    { id: 'previous', name: t('Versiones anteriores', 'Previous versions'), filters: { version: ['historical'] } },
    { id: 'limited', name: t('Ediciones físicas limitadas', 'Physical limited editions'), filters: { edition: ['LIMITED_EDITION'] } },
    { id: 'prints', name: t('Obras con prints disponibles', 'Artworks with available prints'), filters: { prints: ['true'] } },
  ]
  const views = [...builtInViews, ...preferences.views]
  const custom = preferences.views.find(view => view.id === query.view)
  const viewExists = views.some(view => view.id === query.view)
  const layout = {
    columns: [...new Set([...preferences.layout.columns.filter(id => Object.hasOwn(labels, id)), 'title'])],
    density: preferences.layout.density === 'compact' ? 'compact' : 'comfortable',
  }
  const rows = result?.key === requestId ? result.rows : []
  const failureCode = failure?.key === requestId ? failure.code : ''
  const loading = result?.key !== requestId && !failureCode
  const ids = selection.key === requestId ? selection.ids : new Set()
  const updateSelection = next => setSelection({ key: requestId, ids: next })
  const refresh = () => {
    loadedFacets.current = false
    setRevision(value => value + 1)
  }

  function persist(next) {
    if (!administrator) return
    setPreferences(next)
    writePreferences.current = writePreferences.current.then(async () => {
      const saved = await savePreference('artwork_inventory', { version: 1, ...next })
      if (saved === false) setNotice(t('No se pudieron guardar las preferencias.', 'Unable to save preferences.'))
    }).catch(() => setNotice(t('No se pudieron guardar las preferencias.', 'Unable to save preferences.')))

  }

  function applyView(id) {
    const view = views.find(item => item.id === id)
    if (!view) return
    if (view.layout) persist({ ...preferences, layout: view.layout })
    setDraftSearch({ base: view.search || '', text: view.search || '' })
    changeQuery({ ...defaultQuery, ...view.settings, view: id, filters: view.filters, search: view.search || '' })
    setViewName('')
    setSelection({ key: '', ids: new Set() })
  }

  function saveView(mode) {
    const name = viewName.trim()
    if (!administrator || (mode === 'create' && preferences.views.length >= 20) || ((mode === 'create' || mode === 'rename') && !name)) return
    const snapshot = {
      filters: query.filters, search, layout,
      settings: { sort: query.sort, descending: query.descending, group: query.group, size: query.size },
    }
    if (mode === 'create') {
      const id = crypto.randomUUID()
      persist({ ...preferences, views: [...preferences.views, { ...snapshot, id, name }] })
      changeQuery({ view: id })
    } else if (custom && mode === 'delete') {
      persist({ ...preferences, views: preferences.views.filter(view => view.id !== custom.id) })
      changeQuery({ view: 'all' })
    } else if (custom) {
      const updated = mode === 'rename' ? { ...custom, name } : { ...custom, ...snapshot }
      persist({ ...preferences, views: preferences.views.map(view => view.id === custom.id ? updated : view) })
    }
    setViewName('')
  }

  async function changeStatus(apply) {
    const { target, queryKey, preview } = bulk
    const ids = apply ? preview.filter(row => row.outcome === 'eligible').map(row => row.id) : bulk.ids
    setBulk(current => ({ ...current, busy: true, error: '' }))
    try {
      const response = await fetch(API, {
        method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, target, apply }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      if (apply) {
        setReport({
          target, names: bulk.names,
          results: [...data.results, ...preview.filter(row => row.outcome !== 'eligible')],
        })
        setBulk(null)
        if (requestId === queryKey) updateSelection(new Set())
        refresh()
      } else {
        setBulk(current => ({ ...current, preview: data.results, busy: false }))
      }
    } catch (error) {
      setBulk(current => ({ ...current, busy: false, error: error.message }))
    }
  }

  function openBulk(selected) {
    setReport(null)
    setBulk({
      ids: selected, target: '', queryKey: requestId,
      names: Object.fromEntries(rows.map(row => [row.id, row.sku || artworkTitle(row)])),
    })
  }

  const outcomeLabels = {
    successful: t('Actualizada', 'Updated'), failed: t('Fallida', 'Failed'),
    skipped: t('Omitida', 'Skipped'), eligible: t('Elegible', 'Eligible'),
  }
  const reasons = {
    already_set: t('Ya tiene ese estado', 'Already in this state'),
    protected_workflow: t('Protegida por un flujo de inventario, propiedad o venta', 'Protected by an inventory, ownership or sales workflow'),
    not_ready_for_sale: t('La obra necesita precio y publicación para venderse', 'Artwork needs a price and publication before it can be sold'),
    not_found: t('Obra no encontrada', 'Artwork not found'),
    record_busy: t('La obra se está actualizando', 'Artwork is being updated'),
    write_rejected: t('La base de datos rechazó el cambio', 'Database rejected the change'),
  }
  function resultsList(results, names) {
    return <ul className={styles.results}>{results.map(({ id, outcome, reason }) => <li key={id}>
      {names[id] || id} · {outcomeLabels[outcome]}{reason && ' · ' + (reasons[reason] || reason)}
    </li>)}</ul>
  }
  const errorText = code => code === 'inventory_busy'
    ? t('El inventario está ocupado. Intenta de nuevo.', 'Inventory is busy. Try again.')
    : ['forbidden', 'unauthorized'].includes(code)
      ? t('Se requiere acceso administrativo.', 'Administrator access is required.')
      : t('No se pudo completar la operación de inventario.', 'The inventory operation could not be completed.')

  return <div className={styles.shell}>
    <header className={styles.header}>
      <h1>{t('Inventario de Obras', 'Artwork Inventory')}</h1>
      <Button as={Link} href="/admin/artworks/new" renderIcon={Add} size="md">
        {t('Registrar Nueva Obra', 'Register New Artwork')}
      </Button>
    </header>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {report && <section className={styles.notice} aria-label={t('Resultado del cambio', 'Change results')}>
      <p role="status">{display(report.target)} · {['successful', 'failed', 'skipped'].map(outcome =>
        outcomeLabels[outcome] + ' ' + report.results.filter(record => record.outcome === outcome).length).join(' · ')}</p>
      {resultsList(report.results, report.names)}
      <Button size="sm" kind="ghost" onClick={() => setReport(null)}>{t('Cerrar', 'Dismiss')}</Button>
    </section>}
    <AdminDataGrid t={t} label={t('Inventario de Obras', 'Artwork Inventory')}
      pageSizes={PAGE_SIZES} layoutDisabled={!administrator} rows={rows} columns={columns} getId={row => row.id} layout={layout}
      setLayout={next => persist({ ...preferences, layout: next })}
      resetLayout={() => persist({ ...preferences, layout: { ...layout, columns: defaultLayout.columns } })}
      query={{ ...query, view: viewExists ? query.view : 'all' }} changeQuery={changeQuery}
      search={search} setSearch={text => setDraftSearch({ base: query.search, text })}
      searchFields={[labels.title, labels.series, labels.owner, labels.token]} filters={filters}
      total={result?.total || 0} loading={loading} error={failureCode ? errorText(failureCode) : ''} refresh={refresh}
      selection={ids} setSelection={updateSelection}
      scrollKey={administrator ? inventoryScrollKey(administrator, url) : undefined} scrollPositionRef={scrollPositionRef}
      views={views} onView={applyView} viewActions={<div className={styles.viewActions}>
        <TextInput id="inventory-view-name" labelText={t('Nombre de la vista', 'View name')}
          maxLength={80} value={viewName} onChange={event => setViewName(event.target.value)} />
        <Button size="sm" disabled={!administrator || preferences.views.length >= 20 || !viewName.trim()} onClick={() => saveView('create')}>{t('Guardar como nueva', 'Save as new view')}</Button>
        {custom && <>
          <Button size="sm" kind="secondary" disabled={!viewName.trim()} onClick={() => saveView('rename')}>{t('Cambiar nombre', 'Rename')}</Button>
          <Button size="sm" kind="secondary" onClick={() => saveView('update')}>{t('Actualizar vista', 'Update view')}</Button>
          <Button size="sm" kind="danger--tertiary" onClick={() => saveView('delete')}>{t('Eliminar vista', 'Delete view')}</Button>
        </>}
      </div>}
      rowActions={{ label: artworkTitle, render: row => <OverflowMenu flipped size="md"
        iconDescription={t('Acciones para', 'Actions for') + ' ' + artworkTitle(row)}>
        <OverflowMenuItem itemText={t('Editar obra', 'Edit artwork')} href={editHref(row)} />
        {row.public && row.sku && <OverflowMenuItem itemText={t('Ver obra pública', 'View public artwork')} href={'/artwork/' + encodeURIComponent(row.sku)} />}
        {row.sku && <OverflowMenuItem itemText={t('Ver certificado', 'View certificate')} href={'/verify/' + encodeURIComponent(row.sku)} />}
        {row.sku && <OverflowMenuItem itemText={t('Copiar SKU', 'Copy SKU')} onClick={async () => {
          try {
            await navigator.clipboard.writeText(row.sku)
            setNotice(t('SKU copiado', 'SKU copied'))
          } catch {
            setNotice(t('No se pudo copiar el SKU.', 'Unable to copy SKU.'))
          }
        }} />}
        {row.has_versions && <OverflowMenuItem itemText={t('Ver versiones', 'View artwork versions')} href={editHref(row, '#artwork-versions')} />}
        {row.allows_prints && <OverflowMenuItem itemText={t('Ver prints relacionados', 'View related prints')} href={'/admin/prints?artwork=' + encodeURIComponent(row.id)} />}
        {row.can_change_status &&
          <OverflowMenuItem itemText={t('Cambiar disponibilidad', 'Change availability')} onClick={() => openBulk([row.id])} />}
      </OverflowMenu> }}
      bulkActions={selected => <Button size="sm" onClick={() => openBulk(selected)}>{t('Cambiar disponibilidad', 'Change availability')}</Button>}
    />
    {bulk && <Modal open size="sm" modalHeading={t('Cambiar disponibilidad de venta', 'Change sale availability')}
      primaryButtonText={bulk.preview ? t('Confirmar cambio', 'Confirm change') : t('Validar selección', 'Validate selection')}
      secondaryButtonText={t('Cancelar', 'Cancel')}
      primaryButtonDisabled={bulk.busy || !bulk.target || (bulk.preview && !bulk.preview.some(row => row.outcome === 'eligible'))}
      onRequestClose={() => { if (!bulk.busy) setBulk(null) }}
      onRequestSubmit={() => changeStatus(Boolean(bulk.preview))}>
      <p>{bulk.ids.length} {t('obras seleccionadas en esta página', 'artworks selected on this page')}</p>
      <Select id="inventory-target" labelText={t('Disponibilidad nueva', 'Target availability')} value={bulk.target}
        disabled={bulk.busy} onChange={event => setBulk({ ...bulk, target: event.target.value, preview: null, error: '' })}>
        <SelectItem value="" text={t('Selecciona un estado', 'Choose a status')} />
        {AVAILABILITY_TARGETS.map(value => <SelectItem key={value} value={value} text={display(value)} />)}
      </Select>
      {bulk.preview && resultsList(bulk.preview, bulk.names)}
      {bulk.error && <p role="alert">{errorText(bulk.error)}</p>}
      {bulk.busy && <InlineLoading description={t('Procesando…', 'Processing…')} />}
    </Modal>}
  </div>
}

export default function AdminArtworksPage() {
  return <Suspense fallback={<InlineLoading />}><Inventory /></Suspense>
}
