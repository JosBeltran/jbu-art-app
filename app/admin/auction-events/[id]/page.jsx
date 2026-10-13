'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Checkbox, ComboBox, InlineLoading, InlineNotification, Modal, NumberInput, Tag, TextArea, TextInput } from '@carbon/react'
import { ArrowLeft, ArrowUp, ArrowDown, Save, Rocket, Close, View, Add, Edit, TrashCan } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { formatMXN } from '@/lib/auctions'
import { lotLabel } from '@/lib/auctionEvents'

const toLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const slugify = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const EMPTY = { name: '', slug: '', subtitle: '', description: '', cover_image_url: '', starts_at: '', closing_starts_at: '', sequential_closing_enabled: false, closing_interval_minutes: 2, featured: false }

const RESULT_TEXT = (t) => ({
  HAS_BIDS: t('Ya hay pujas en algún lote: el orden y los horarios quedan bloqueados para no afectar a los postores.', 'A lot already has bids: order and timing are locked to protect bidders.'),
  CONFIRM_REQUIRED: t('El evento ya empezó. Confirma para reordenar.', 'The event has started. Confirm to reorder.'),
  IN_OTHER_EVENT: t('Esa subasta ya pertenece a otro evento.', 'That auction already belongs to another event.'),
  CLOSED: t('Esa subasta ya cerró.', 'That auction is already closed.'),
  MISMATCH: t('La lista de lotes cambió; recarga la página.', 'The lot list changed; reload the page.'),
  NOT_FOUND: t('No encontrado.', 'Not found.'),
})

export default function AuctionEventEditorPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const router = useRouter()
  const { t, locale } = useI18n()
  const [form, setForm] = useState(EMPTY)
  const [event, setEvent] = useState(null)
  const [lots, setLots] = useState([])
  const [candidates, setCandidates] = useState([])
  const [pick, setPick] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmReorder, setConfirmReorder] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const load = useCallback(async () => {
    if (isNew) { setLoading(false); return }
    await supabase.rpc('settle_auctions', { _auction: null })
    const { data: e, error } = await supabase.from('auction_events').select('*').eq('id', id).single()
    if (error) { setError(error.message); setLoading(false); return }
    setEvent(e)
    setForm({
      name: e.name, slug: e.slug, subtitle: e.subtitle || '', description: e.description || '', cover_image_url: e.cover_image_url || '',
      starts_at: toLocal(e.starts_at), closing_starts_at: toLocal(e.closing_starts_at), sequential_closing_enabled: e.sequential_closing_enabled,
      closing_interval_minutes: e.closing_interval_minutes, featured: e.featured,
    })
    const [{ data: ls }, { data: cs }] = await Promise.all([
      supabase.from('auctions').select('*, artworks(title, sku, primary_image_url)').eq('auction_event_id', id).order('lot_order', { ascending: true }),
      supabase.from('auctions').select('id, status, auction_event_id, starts_at, ends_at, artworks(title, sku)').is('auction_event_id', null).in('status', ['DRAFT', 'UPCOMING', 'LIVE']).order('created_at', { ascending: false }),
    ])
    const withWatchers = await Promise.all((ls || []).map(async (a) => {
      const { data: n } = await supabase.rpc('admin_auction_watchers', { _auction: a.id })
      return { ...a, watchers: n ?? 0 }
    }))
    setLots(withWatchers); setCandidates(cs || []); setLoading(false)
  }, [id, isNew])

  useEffect(() => { load() }, [load])

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const anyBids = lots.some((l) => Number(l.bid_count) > 0)
  const started = event && new Date(event.starts_at) <= new Date()
  const candidateItems = useMemo(() => candidates.map((c) => ({ id: c.id, text: `${c.artworks?.title || c.id} · ${c.artworks?.sku || ''} · ${c.status}` })), [candidates])

  const validate = () => {
    if (!form.name.trim()) return t('Escribe un nombre.', 'Enter a name.')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug)) return t('La dirección solo admite minúsculas, números y guiones.', 'The URL slug only allows lowercase letters, numbers and hyphens.')
    if (!form.starts_at) return t('Define el inicio del evento.', 'Set the event start.')
    if (form.sequential_closing_enabled && !form.closing_starts_at) return t('Define cuándo empieza el cierre secuencial.', 'Set when sequential closing starts.')
    if (form.closing_starts_at && new Date(form.closing_starts_at) <= new Date(form.starts_at)) return t('El cierre debe ser después del inicio.', 'Closing must be after the start.')
    return ''
  }

  const timingChanged = event && (
    new Date(form.closing_starts_at || 0).getTime() !== new Date(event.closing_starts_at || 0).getTime() ||
    Number(form.closing_interval_minutes) !== event.closing_interval_minutes || form.sequential_closing_enabled !== event.sequential_closing_enabled)

  const save = async (status) => {
    const v = validate(); if (v) { setError(v); return }
    if (timingChanged && anyBids) { setError(RESULT_TEXT(t).HAS_BIDS); return }
    setSaving(true); setError(''); setNotice('')
    const payload = {
      name: form.name.trim(), slug: form.slug, subtitle: form.subtitle || null, description: form.description || null,
      cover_image_url: form.cover_image_url || null, starts_at: new Date(form.starts_at).toISOString(),
      closing_starts_at: form.closing_starts_at ? new Date(form.closing_starts_at).toISOString() : null,
      sequential_closing_enabled: form.sequential_closing_enabled, closing_interval_minutes: Number(form.closing_interval_minutes) || 2,
      featured: form.featured, ...(status ? { status } : {}),
    }
    const q = isNew ? supabase.from('auction_events').insert({ ...payload, status: status || 'DRAFT' }).select().single() : supabase.from('auction_events').update(payload).eq('id', id).select().single()
    const { data, error } = await q
    if (error) { setSaving(false); setError(error.message.includes('slug') ? t('Esa dirección ya existe.', 'That URL slug already exists.') : error.message); return }
    if (!isNew) await supabase.rpc('admin_event_apply_schedule', { _event: id })
    if (status === 'UPCOMING') {
      // publica lotes en borrador del evento (cada uno conserva su configuración)
      await supabase.from('auctions').update({ status: 'UPCOMING' }).eq('auction_event_id', data.id).eq('status', 'DRAFT')
    }
    setSaving(false)
    if (isNew) { router.replace(`/admin/auction-events/${data.id}`); return }
    setNotice(t('Guardado.', 'Saved.')); load()
  }

  const rpc = async (fn, args) => {
    setError(''); setNotice('')
    const { data, error } = await supabase.rpc(fn, args)
    if (error) { setError(error.message); return false }
    if (data && data !== 'OK' && typeof data === 'string') {
      if (data === 'CONFIRM_REQUIRED') { setConfirmReorder(args._ids); return false }
      setError(RESULT_TEXT(t)[data] || data); return false
    }
    await load(); return true
  }

  const move = (idx, dir) => {
    const ids = lots.map((l) => l.id)
    const j = idx + dir; if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    rpc('admin_event_reorder', { _event: id, _ids: ids, _confirm: false })
  }

  const cancelEvent = async () => {
    setConfirmCancel(false)
    const { error } = await supabase.from('auction_events').update({ status: 'CANCELLED' }).eq('id', id)
    if (error) setError(error.message); else { setNotice(t('Evento cancelado. Los lotes siguen como subastas individuales; cancélalos uno a uno si es necesario.', 'Event cancelled. Lots remain individual auctions; cancel them one by one if needed.')); load() }
  }

  if (loading) return <InlineLoading description={t('Cargando…', 'Loading…')} />
  const section = { display: 'grid', gap: '1rem', padding: '1.25rem 0', borderTop: '1px solid var(--cds-border-subtle)' }
  const grid = { display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }

  return (
    <div style={{ maxWidth: 1040, display: 'grid', gap: '1.25rem' }}>
      <Link href="/admin/auction-events" style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center' }}><ArrowLeft />{t('Eventos de subasta', 'Auction events')}</Link>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 400, margin: 0 }}>{isNew ? t('Crear evento', 'Create event') : event?.name}</h1>
        {event && <Tag type="purple">{event.status}</Tag>}
      </header>
      {error && <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title={notice} onCloseButtonClick={() => setNotice('')} />}

      <section style={section}>
        <div style={grid}>
          <TextInput id="name" labelText={t('Nombre', 'Name')} value={form.name} onChange={(e) => { const v = e.target.value; setForm((p) => ({ ...p, name: v, slug: isNew && (!p.slug || p.slug === slugify(p.name)) ? slugify(v) : p.slug })) }} />
          <TextInput id="slug" labelText={t('Dirección (/auctions/…)', 'URL slug (/auctions/…)')} value={form.slug} onChange={(e) => set('slug', slugify(e.target.value))} disabled={Boolean(event && event.status !== 'DRAFT')} helperText={event && event.status !== 'DRAFT' ? t('Fija una vez publicado.', 'Locked once published.') : ''} />
          <TextInput id="subtitle" labelText={t('Subtítulo', 'Subtitle')} value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
          <TextInput id="cover" labelText={t('Imagen de portada (URL)', 'Cover image (URL)')} value={form.cover_image_url} onChange={(e) => set('cover_image_url', e.target.value)} helperText={t('Si queda vacío se usan las obras de los lotes.', 'If empty, lot artworks are used.')} />
        </div>
        {lots.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
            {lots.filter((l) => l.artworks?.primary_image_url).slice(0, 6).map((l) => (
              <button key={l.id} type="button" onClick={() => set('cover_image_url', l.artworks.primary_image_url)} style={{ padding: 0, border: form.cover_image_url === l.artworks.primary_image_url ? '2px solid var(--jbu-purple)' : '1px solid var(--cds-border-subtle)', background: 'none', cursor: 'pointer' }} aria-label={t('Usar como portada', 'Use as cover')}>
                <img src={l.artworks.primary_image_url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>
        )}
        <TextArea id="description" labelText={t('Descripción', 'Description')} rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </section>

      <section style={section}>
        <h2 style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>{t('Tiempos', 'Timing')}</h2>
        {anyBids && <InlineNotification kind="warning" lowContrast hideCloseButton title={t('Hay pujas: los horarios de cierre y el orden quedan bloqueados.', 'Bids exist: closing times and order are locked.')} />}
        <div style={grid}>
          <TextInput id="starts_at" type="datetime-local" labelText={t('Inicio del evento', 'Event start')} value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
          <TextInput id="closing_starts_at" type="datetime-local" labelText={t('Inicio del cierre (primer lote)', 'Closing starts (first lot)')} value={form.closing_starts_at} onChange={(e) => set('closing_starts_at', e.target.value)} disabled={anyBids} />
        </div>
        <div style={{ ...grid, alignItems: 'end' }}>
          <Checkbox id="seq" labelText={t('Cierre secuencial de lotes', 'Sequential lot closing')} checked={form.sequential_closing_enabled} onChange={(_, { checked }) => set('sequential_closing_enabled', checked)} disabled={anyBids} />
          <NumberInput id="interval" label={t('Minutos entre lotes', 'Minutes between lots')} min={1} max={240} value={form.closing_interval_minutes} onChange={(_, { value }) => set('closing_interval_minutes', value)} disabled={anyBids} />
          <Checkbox id="featured" labelText={t('Destacar en la portada', 'Feature on home page')} checked={form.featured} onChange={(_, { checked }) => set('featured', checked)} />
        </div>
        <p style={{ margin: 0, fontSize: '.8125rem', color: 'var(--cds-text-secondary)' }}>{t('Con cierre secuencial, el lote 01 cierra a la hora indicada y cada lote siguiente unos minutos después. Las horas se guardan en cada lote; las pujas de último minuto solo extienden ese lote.', 'With sequential closing, lot 01 closes at the set time and each next lot a few minutes later. Times are stored on each lot; late bids only extend that lot.')}</p>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
        <Button kind="secondary" renderIcon={Save} disabled={saving} onClick={() => save(null)}>{t('Guardar', 'Save')}</Button>
        {(!event || event.status === 'DRAFT') && <Button renderIcon={Rocket} disabled={saving || (!isNew && lots.length === 0)} onClick={() => save('UPCOMING')}>{t('Publicar evento y lotes', 'Publish event and lots')}</Button>}
        {event && <Link href={`/auctions/${event.slug}`} target="_blank"><Button kind="ghost" renderIcon={View}>{event.status === 'DRAFT' ? t('Vista previa (publica primero)', 'Preview (publish first)') : t('Ver página pública', 'View public page')}</Button></Link>}
        {event && event.status !== 'CANCELLED' && <Button kind="danger--ghost" renderIcon={Close} onClick={() => setConfirmCancel(true)}>{t('Cancelar evento', 'Cancel event')}</Button>}
      </div>

      {!isNew && (
        <section style={section}>
          <h2 style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>{t('Lotes', 'Lots')} ({lots.length})</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', alignItems: 'end' }}>
            <div style={{ flex: '1 1 20rem' }}>
              <ComboBox id="add-lot" titleText={t('Agregar subasta existente como lote', 'Add existing auction as lot')} items={candidateItems} itemToString={(i) => i?.text || ''} selectedItem={pick} onChange={({ selectedItem }) => setPick(selectedItem || null)} placeholder={t('Subastas sin evento', 'Auctions without event')} />
            </div>
            <Button kind="tertiary" renderIcon={Add} disabled={!pick} onClick={async () => { if (await rpc('admin_event_add_lot', { _event: id, _auction: pick.id })) setPick(null) }}>{t('Agregar', 'Add')}</Button>
            <Link href="/admin/auctions/new"><Button kind="ghost">{t('Crear subasta nueva para una obra', 'Create new auction for an artwork')}</Button></Link>
          </div>
          <p style={{ margin: 0, fontSize: '.8125rem', color: 'var(--cds-text-secondary)' }}>{t('Cada lote conserva su propia puja inicial, reserva, incremento y "Comprar ya". Edítalos con "Editar lote".', 'Each lot keeps its own starting bid, reserve, increment and Buy Now. Edit them with "Edit lot".')}</p>
          {lots.length === 0 ? <p style={{ color: 'var(--cds-text-secondary)' }}>{t('Sin lotes todavía.', 'No lots yet.')}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {lots.map((l, idx) => (
                <li key={l.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '.5rem 1rem', padding: '.75rem 0', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                  <span style={{ fontFamily: 'var(--font-plex-mono), monospace', color: 'var(--jbu-purple)', minWidth: '4.5rem' }}>{t('Lote', 'Lot')} {lotLabel(l.lot_number)}</span>
                  <span style={{ flex: '1 1 12rem', display: 'grid' }}>
                    <span style={{ fontWeight: 500 }}>{l.artworks?.title}</span>
                    <span style={{ fontSize: '.75rem', color: 'var(--cds-text-secondary)' }}>{new Date(l.starts_at).toLocaleString(locale)} → {new Date(l.ends_at).toLocaleString(locale)}{l.extended_count > 0 ? ` · ${t('extendido', 'extended')}` : ''}</span>
                  </span>
                  <Tag size="sm" type={l.status === 'LIVE' ? 'green' : 'gray'}>{l.status}</Tag>
                  <span style={{ fontSize: '.8125rem' }}>{formatMXN(l.current_bid ?? l.starting_bid, locale)} · {l.bid_count} {t('pujas', 'bids')} · {l.watchers} {t('seguidores', 'watchers')}</span>
                  <span style={{ display: 'flex', gap: '.25rem' }}>
                    <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowUp} iconDescription={t('Subir', 'Move up')} disabled={anyBids || idx === 0} onClick={() => move(idx, -1)} />
                    <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowDown} iconDescription={t('Bajar', 'Move down')} disabled={anyBids || idx === lots.length - 1} onClick={() => move(idx, 1)} />
                    <Link href={`/admin/auctions/${l.id}`}><Button kind="ghost" size="sm" renderIcon={Edit}>{t('Editar lote', 'Edit lot')}</Button></Link>
                    <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription={t('Quitar del evento', 'Remove from event')} disabled={Number(l.bid_count) > 0} onClick={() => rpc('admin_event_remove_lot', { _event: id, _auction: l.id })} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal open={Boolean(confirmReorder)} danger modalHeading={t('El evento ya empezó', 'The event has started')} primaryButtonText={t('Reordenar de todos modos', 'Reorder anyway')} secondaryButtonText={t('Cancelar', 'Cancel')}
        onRequestClose={() => setConfirmReorder(null)} onRequestSubmit={async () => { const ids = confirmReorder; setConfirmReorder(null); await rpc('admin_event_reorder', { _event: id, _ids: ids, _confirm: true }) }}>
        <p>{t('Cambiará la numeración y, si hay cierre secuencial, los horarios de los lotes sin pujas. Los visitantes pueden ver el cambio.', 'Numbering and, with sequential closing, times of lots without bids will change. Visitors may notice.')}</p>
      </Modal>
      <Modal open={confirmCancel} danger modalHeading={t('Cancelar evento', 'Cancel event')} primaryButtonText={t('Cancelar evento', 'Cancel event')} secondaryButtonText={t('Volver', 'Back')}
        onRequestClose={() => setConfirmCancel(false)} onRequestSubmit={cancelEvent}>
        <p>{t('La página del evento mostrará "cancelada". Las subastas individuales no se cancelan automáticamente.', 'The event page will show "cancelled". Individual auctions are not cancelled automatically.')}</p>
      </Modal>
    </div>
  )
}
