'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Button, DataTable, InlineLoading, InlineNotification, Modal, Pagination, Select, SelectItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tag, TextArea, TextInput, Toggle,
} from '@carbon/react'
import { CheckmarkOutline, WarningAlt } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { numberPhysicalEdition } from '@/lib/physicalEdition'
import styles from './PhysicalEditionManager.module.css'

const empty = { type: 'UNIQUE', size: '', signed: false, es: '', en: '', madeToOrder: false, frameEs: '', frameEn: '' }
type EditionSettings = typeof empty
type Counts = { edition_size: number; available: number; reserved: number; sold: number; sales_enabled: boolean }
type Unit = { id: string; edition_number: number; unit_identifier: string; status: string; order_id?: string; collector?: string; certificate_sku?: string; created_at: string; reserved_at?: string; sold_at?: string }

export default function PhysicalEditionManager({ artworkId, catalogSaveRevision }: { artworkId: string; catalogSaveRevision: number }) {
  const { t, locale } = useI18n()
  const [saved, setSaved] = useState<EditionSettings | null>(null)
  const [draft, setDraft] = useState(empty)
  const [activatedBefore, setActivatedBefore] = useState(false)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loading, setLoading] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const [inventoryError, setInventoryError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const refresh = useCallback(async () => {
    const { data: a, error } = await supabase.from('artworks')
      .select('physical_edition_type,physical_edition_size,physical_edition_signed,physical_edition_signature_confirmed,physical_edition_description_es,physical_edition_description_en,physical_edition_made_to_order,physical_edition_frame_es,physical_edition_frame_en,physical_edition_sales_activated_at')
      .eq('id', artworkId).single()
    if (error || !a) { setSaved(null); setLoading(false); return }
    const settings = {
      type: a.physical_edition_type, size: String(a.physical_edition_size || ''),
      signed: Boolean(a.physical_edition_signed && a.physical_edition_signature_confirmed),
      es: a.physical_edition_description_es || '', en: a.physical_edition_description_en || '',
      madeToOrder: a.physical_edition_made_to_order, frameEs: a.physical_edition_frame_es || '', frameEn: a.physical_edition_frame_en || '',
    }
    const [inventory, readiness] = await Promise.all([
      supabase.rpc('physical_edition_counts', { _artwork_id: artworkId }),
      supabase.rpc('physical_edition_readiness', { _artwork: artworkId }),
    ])
    setActivatedBefore(Boolean(a.physical_edition_sales_activated_at))
    setSaved(settings)
    setDraft(settings)
    setCounts(inventory.data)
    setChecks(readiness.data)
    setLoading(false)
    return inventory.data as Counts | null
  }, [artworkId])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (!catalogSaveRevision) return
    let current = true
    void supabase.rpc('physical_edition_readiness', { _artwork: artworkId }).then(({ data }) => {
      if (current) setChecks(data)
    })
    return () => { current = false }
  }, [artworkId, catalogSaveRevision])

  useEffect(() => {
    if (saved?.type !== 'LIMITED_EDITION') return
    let current = true
    setLoadingUnits(true)
    void supabase.rpc('physical_edition_inventory', { _artwork: artworkId, _status: filter || null, _offset: (page - 1) * pageSize, _limit: pageSize })
      .then(({ data, error }) => {
        if (!current) return
        setUnits(data || [])
        setInventoryError(Boolean(error))
        setLoadingUnits(false)
      })
    return () => { current = false }
  }, [artworkId, saved, filter, page, pageSize])

  const update = <K extends keyof EditionSettings>(key: K, value: EditionSettings[K]) =>
    setDraft(previous => ({ ...previous, [key]: value }))
  const changed = JSON.stringify(saved) !== JSON.stringify(draft)
  const structural = draft.type !== saved?.type || draft.size !== saved?.size
  const active = Boolean(counts?.sales_enabled)
  const allocated = Boolean(counts && counts.reserved + counts.sold > 0)
  const ready = checks && Object.values(checks).every(value => value === true)

  async function save() {
    const size = Number(draft.size)
    if (draft.type === 'LIMITED_EDITION' && (!Number.isSafeInteger(size) || size < 1 || size > 10000)) {
      setError(t('Indica un tiraje entero entre 1 y 10,000.', 'Enter an edition size between 1 and 10,000.'))
      return
    }
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const { error } = await supabase.rpc('save_physical_edition', {
        _artwork: artworkId, _type: draft.type, _size: draft.type === 'LIMITED_EDITION' ? size : null,
        _signed: draft.signed, _description_es: draft.es, _description_en: draft.en,
        _made_to_order: draft.madeToOrder, _frame_es: draft.frameEs, _frame_en: draft.frameEn,
      })
      if (error) {
        setError(error.message === 'edition_units_already_allocated' || error.code === '23503'
          ? t('El historial de inventario bloquea el cambio de tiraje.', 'Inventory history blocks changes to the edition size.')
          : error.message === 'edition_signature_locked'
            ? t('La firma está bloqueada por una compra o reserva.', 'A purchase or reservation locks the signature setting.')
            : t('No se pudo guardar. Revisa el historial de ventas y la configuración de la obra.', 'Could not save. Check the artwork settings and sales history.'))
        return
      }
      setPage(1)
      const inventory = await refresh()
      const total = inventory && inventory.available + inventory.reserved + inventory.sold
      setSuccess(total ? t(`Configuración guardada. ${total} ejemplares registrados.`, `Settings saved. ${total} registered units.`) : t('Configuración guardada.', 'Settings saved.'))
    } finally { setBusy(false) }
  }

  async function changeSales() {
    setConfirm(false)
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const { error } = await supabase.rpc('set_physical_edition_sales_enabled', { _artwork: artworkId, _enabled: !active })
      await refresh()
      if (error) setError(t('No se pudo cambiar el estado de ventas. Revisa los requisitos actualizados.', 'Sales could not be updated. Review the refreshed checklist.'))
      else setSuccess(active ? t('Ventas pausadas.', 'Sales paused.') : t('Ventas habilitadas.', 'Sales enabled.'))
    } finally { setBusy(false) }
  }

  if (loading) return <InlineLoading description={t('Cargando edición…', 'Loading edition…')} />
  if (!saved) return <InlineNotification kind="warning" hideCloseButton title={t('Configuración no disponible', 'Edition configuration unavailable')}
    subtitle={t('Verifica los permisos y la migración de ediciones físicas.', 'Check your permissions and the physical edition migration.')} />

  const checklist = [
    ['edition', t('Configura y guarda el tipo de edición y el tiraje.', 'Set and save the edition type and size.')],
    ['inventory', t('Comprueba que los ejemplares registrados coincidan con el tiraje.', 'Verify that registered units match the edition size.')],
    ['stock', t('Debe quedar al menos un ejemplar disponible.', 'At least one unit must be available.')],
    ['publication', t('Publica la obra como disponible y verifica que su serie esté activa.', 'Publish the artwork as available and verify that its series is active.')],
    ['price', t('En Precios, habilita Mostrar precio y captura un importe positivo.', 'In Pricing, select Show price and enter a positive amount.')],
    ['ownership', t('Resuelve cualquier propiedad o reserva de la obra original.', 'Resolve any original-artwork ownership or reservation.')],
    ['auction', t('Resuelve la subasta activa o pendiente de pago.', 'Resolve the active auction or auction payment.')],
    ['offer', t('Resuelve la oferta aceptada pendiente de pago.', 'Resolve the accepted offer awaiting payment.')],
    ['shipping', t('En Envíos, configura al menos un país con una política de pago válida.', 'In Shipping, configure at least one destination with a checkout-compatible policy.')],
    ['checkout', t('Aplica la migración de compra de ediciones físicas.', 'Apply the physical edition checkout migration.')],
    ['certificates', t('Aplica la migración de certificados individuales.', 'Apply the individual certificate migration.')],
  ]
  const headers = [
    { key: 'number', header: t('Ejemplar', 'Edition number') },
    { key: 'identifier', header: t('Identificador', 'Unit identifier') },
    { key: 'status', header: t('Estado', 'Status') },
    { key: 'order', header: t('Pedido', 'Order') },
    { key: 'collector', header: t('Coleccionista', 'Collector') },
    { key: 'certificate', header: t('Certificado', 'Certificate') },
    { key: 'date', header: t('Último movimiento', 'Latest activity') },
  ]
  const unitStates: Record<string, string> = {
    AVAILABLE: t('Disponible', 'Available'), RESERVED: t('Reservado', 'Reserved'), SOLD: t('Vendido', 'Sold'),
  }
  const rows = units.map(unit => ({
    id: unit.id, number: numberPhysicalEdition(unit.edition_number, counts?.edition_size), identifier: unit.unit_identifier,
    status: unitStates[unit.status] || unit.status, order: unit.order_id || '—', collector: unit.collector || '—',
    certificate: unit.certificate_sku ? t('Emitido', 'Issued') : unit.status === 'SOLD' ? t('Pendiente', 'Pending') : '—',
    date: new Date(unit.sold_at || unit.reserved_at || unit.created_at).toLocaleString(locale),
  }))
  const total = counts ? counts.available + counts.reserved + counts.sold : 0
  const filteredTotal = filter && counts ? (counts[filter.toLowerCase() as 'available' | 'reserved' | 'sold'] || 0) : total

  return (
    <section className={styles.manager}>
      <h2>{t('Edición física de la obra', 'Physical artwork edition')}</h2>
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title={t('Error de edición', 'Edition error')} subtitle={error} />}
      {success && <InlineNotification kind="success" lowContrast hideCloseButton title={success} />}
      <section className={styles.section}>
        <h3>{t('Configuración de la edición', 'Edition configuration')}</h3>
        <Select id="physical-edition-type" labelText={t('Tipo de obra física', 'Physical artwork type')} value={draft.type}
          disabled={busy || active || allocated} onChange={event => update('type', event.target.value)}>
          <SelectItem value="UNIQUE" text={t('Original único', 'Unique original')} />
          <SelectItem value="LIMITED_EDITION" text={t('Edición física limitada', 'Physical Limited Edition')} />
        </Select>
        {draft.type === 'LIMITED_EDITION' && <>
          <TextInput id="physical-edition-size" labelText={t('Tiraje total', 'Total edition size')} type="number" min={1} max={10000}
            disabled={busy || active || allocated} value={draft.size} onChange={event => update('size', event.target.value)} />
          {active && <p>{t('Pausa las ventas antes de cambiar el tipo o el tiraje.', 'Pause sales before changing the type or edition size.')}</p>}
          <div className={styles.fields}>
            <TextArea id="physical-edition-es" labelText={t('Descripción (ES)', 'Description (ES)')} rows={3} maxLength={2000}
              value={draft.es} onChange={event => update('es', event.target.value)} />
            <TextArea id="physical-edition-en" labelText={t('Descripción (EN)', 'Description (EN)')} rows={3} maxLength={2000}
              value={draft.en} onChange={event => update('en', event.target.value)} />
            <TextInput id="physical-edition-frame-es" labelText={t('Marco (ES)', 'Framing (ES)')} maxLength={240}
              value={draft.frameEs} onChange={event => update('frameEs', event.target.value)} />
            <TextInput id="physical-edition-frame-en" labelText={t('Marco (EN)', 'Framing (EN)')} maxLength={240}
              value={draft.frameEn} onChange={event => update('frameEn', event.target.value)} />
          </div>
          <Toggle id="physical-edition-signed" labelText={t('Firma individual confirmada para esta producción', 'Individual signature confirmed for this production')}
            labelA={t('No','No')} labelB={t('Sí','Yes')} toggled={draft.signed} disabled={allocated} onToggle={value => update('signed', value)} />
          <Toggle id="physical-edition-made-to-order" labelText={t('Producida bajo pedido', 'Made to order')}
            labelA={t('No','No')} labelB={t('Sí','Yes')} toggled={draft.madeToOrder} onToggle={value => update('madeToOrder', value)} />
        </>}
        <Button type="button" kind="secondary" disabled={busy || !changed || (active && structural)} onClick={save}>
          {t('Guardar configuración de edición', 'Save edition settings')}
        </Button>
      </section>
      {saved.type === 'LIMITED_EDITION' && <>
        <section className={styles.section}>
          <h3>{t('Requisitos y activación', 'Sales readiness and activation')}</h3>
          <div><Tag type={active ? 'green' : ready ? 'blue' : 'gray'}>{counts && counts.sold === counts.edition_size ? t('Agotada', 'Sold out')
            : active ? t('Ventas habilitadas', 'Sales enabled')
            : activatedBefore ? t('Ventas pausadas', 'Sales paused')
            : ready ? t('Lista para activar', 'Ready to activate') : t('Configuración incompleta', 'Configuration incomplete')}</Tag></div>
          {checks ? <ul className={styles.checklist}>{checklist.map(([key, label]) => <li key={key}>
            {checks[key] ? <CheckmarkOutline aria-hidden="true" /> : <WarningAlt aria-hidden="true" />}
            <span><strong>{checks[key] ? t('Cumple', 'Passed') : t('Pendiente', 'Action needed')}</strong> · {label}</span>
          </li>)}</ul> : <InlineNotification kind="warning" hideCloseButton title={t('Validación no disponible', 'Readiness unavailable')} />}
          <Button type="button" kind={active ? 'danger--tertiary' : 'primary'} disabled={busy || (!active && (changed || !ready))}
            onClick={() => active ? void changeSales() : setConfirm(true)}>
            {active ? t('Pausar ventas', 'Pause sales') : t('Activar ventas', 'Enable sales')}
          </Button>
          <Modal open={confirm} modalHeading={t('Activar ventas de la edición', 'Enable edition sales')}
            primaryButtonText={t('Activar ventas', 'Enable sales')} secondaryButtonText={t('Cancelar', 'Cancel')}
            onRequestClose={() => setConfirm(false)} onRequestSubmit={() => void changeSales()}>
            <p>{t('La edición podrá recibir compras y cobros por Stripe en el entorno configurado.', 'Collectors will be able to buy this edition and pay through Stripe in the configured environment.')}</p>
          </Modal>
        </section>
        <section className={styles.section}>
          <h3>{t('Inventario de la edición', 'Edition inventory')}</h3>
          {counts && <dl className={styles.summary}>
            {[[t('Registrados', 'Registered'), total], [t('Disponibles', 'Available'), counts.available],
              [t('Reservados', 'Reserved'), counts.reserved], [t('Vendidos', 'Sold'), counts.sold]].map(([label, value]) =>
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>}
          <Select id="physical-edition-inventory-filter" labelText={t('Filtrar por estado', 'Filter by status')} value={filter}
            onChange={event => { setFilter(event.target.value); setPage(1) }}>
            <SelectItem value="" text={t('Todos', 'All')} />
            {Object.entries(unitStates).map(([key, text]) => <SelectItem key={key} value={key} text={text} />)}
          </Select>
          {loadingUnits && <InlineLoading description={t('Cargando ejemplares…', 'Loading edition units…')} />}
          {inventoryError && <InlineNotification kind="error" hideCloseButton title={t('No se pudo cargar el inventario', 'Inventory could not be loaded')} />}
          <div className={styles.table}>
            <DataTable rows={rows} headers={headers}>
              {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) =>
                <TableContainer {...getTableContainerProps()} title={t('Ejemplares individuales', 'Individual units')}>
                  <Table {...getTableProps()}>
                    <TableHead><TableRow>{headers.map(header => {
                      const { key, ...props } = getHeaderProps({ header })
                      return <TableHeader key={key} {...props}>{header.header}</TableHeader>
                    })}</TableRow></TableHead>
                    <TableBody>{rows.map(row => {
                      const { key, ...props } = getRowProps({ row })
                      return <TableRow key={key} {...props}>{row.cells.map(cell => <TableCell key={cell.id}>{cell.value}</TableCell>)}</TableRow>
                    })}</TableBody>
                  </Table>
                </TableContainer>}
            </DataTable>
          </div>
          {filteredTotal > 0 && <Pagination page={page} pageSize={pageSize} pageSizes={[10, 25, 50]} totalItems={filteredTotal}
            itemsPerPageText={t('Ejemplares por página', 'Units per page')}
            backwardText={t('Página anterior', 'Previous page')} forwardText={t('Página siguiente', 'Next page')}
            onChange={({ page: next, pageSize: size }) => { setPage(size === pageSize ? next : 1); setPageSize(size) }} />}
        </section>
      </>}
    </section>
  )
}
