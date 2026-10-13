'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Checkbox, ComboBox, InlineLoading, InlineNotification, Modal, NumberInput, Tag, TextInput } from '@carbon/react'
import { ArrowLeft, Save, Rocket, Close, View, Share } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { formatMXN } from '@/lib/auctions'

const toLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const EMPTY = { artwork_id: '', starts_at: '', ends_at: '', starting_bid: 10000, reserve_price: '', buy_now_price: '', minimum_increment: 1000, anti_sniping_enabled: true, extension_minutes: 2, payment_window_hours: 72 }

export default function AuctionEditorPage() {
  const { id } = useParams()
  const isNew = id === 'new'
  const router = useRouter()
  const { t, locale } = useI18n()
  const [form, setForm] = useState(EMPTY)
  const [auction, setAuction] = useState(null)
  const [artworks, setArtworks] = useState([])
  const [bids, setBids] = useState([])
  const [watchers, setWatchers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preview, setPreview] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: arts } = await supabase.from('artworks').select('id, title, sku, ownership_status').order('created_at', { ascending: false })
      setArtworks(arts || [])
      if (!isNew) {
        await supabase.rpc('settle_auctions', { _auction: id })
        const { data: a, error } = await supabase.from('auctions').select('*').eq('id', id).single()
        if (error) { setError(error.message); setLoading(false); return }
        setAuction(a)
        setForm({
          artwork_id: a.artwork_id, starts_at: toLocal(a.starts_at), ends_at: toLocal(a.ends_at), starting_bid: Number(a.starting_bid),
          reserve_price: a.reserve_price ?? '', buy_now_price: a.buy_now_price ?? '', minimum_increment: Number(a.minimum_increment),
          anti_sniping_enabled: a.anti_sniping_enabled, extension_minutes: a.extension_minutes, payment_window_hours: a.payment_window_hours,
        })
        const [{ data: b }, { data: w }] = await Promise.all([
          supabase.rpc('admin_auction_bids', { _auction: id }),
          supabase.rpc('admin_auction_watchers', { _auction: id }),
        ])
        setBids(b || []); setWatchers(w || 0)
      }
      setLoading(false)
    }
    load()
  }, [id])

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const locked = auction && !['DRAFT', 'UPCOMING'].includes(auction.status)
  const hasBids = Number(auction?.bid_count) > 0
  const artworkItems = useMemo(() => artworks.filter((a) => String(a.ownership_status).toUpperCase() === 'AVAILABLE' || a.id === form.artwork_id).map((a) => ({ id: a.id, text: `${a.title} · ${a.sku}` })), [artworks, form.artwork_id])

  const validate = () => {
    if (!form.artwork_id) return t('Elige una obra.', 'Choose an artwork.')
    if (!form.starts_at || !form.ends_at) return t('Define inicio y fin.', 'Set start and end.')
    if (new Date(form.ends_at) <= new Date(form.starts_at)) return t('El fin debe ser después del inicio.', 'End must be after start.')
    if (!(Number(form.starting_bid) > 0) || !(Number(form.minimum_increment) > 0)) return t('Puja inicial e incremento deben ser mayores a 0.', 'Starting bid and increment must be above 0.')
    if (form.buy_now_price !== '' && Number(form.buy_now_price) < Number(form.starting_bid)) return t('"Comprar ya" debe ser mayor o igual a la puja inicial.', '"Buy now" must be at least the starting bid.')
    return ''
  }

  const save = async (status) => {
    const v = validate(); if (v) { setError(v); return }
    setSaving(true); setError(''); setNotice('')
    const payload = {
      artwork_id: form.artwork_id,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      starting_bid: Number(form.starting_bid),
      reserve_price: form.reserve_price === '' ? null : Number(form.reserve_price),
      buy_now_price: form.buy_now_price === '' ? null : Number(form.buy_now_price),
      minimum_increment: Number(form.minimum_increment),
      anti_sniping_enabled: Boolean(form.anti_sniping_enabled),
      extension_minutes: Number(form.extension_minutes) || 2,
      payment_window_hours: Number(form.payment_window_hours) || 72,
      ...(status ? { status } : {}),
    }
    const q = isNew ? supabase.from('auctions').insert({ ...payload, status: status || 'DRAFT' }).select().single() : supabase.from('auctions').update(payload).eq('id', id).select().single()
    const { data, error } = await q
    setSaving(false)
    if (error) {
      setError(error.message.includes('auctions_one_open_per_artwork') ? t('Esta obra ya tiene una subasta abierta.', 'This artwork already has an open auction.') : error.message)
      return
    }
    if (data?.id && status) await supabase.rpc('settle_auctions', { _auction: data.id })
    if (isNew) { router.replace(`/admin/auctions/${data.id}`); return }
    setAuction(data)
    setNotice(status === 'UPCOMING' ? t('Subasta publicada.', 'Auction published.') : t('Cambios guardados.', 'Changes saved.'))
  }

  const cancel = async () => {
    setConfirmCancel(false); setSaving(true)
    const { data, error } = await supabase.from('auctions').update({ status: 'CANCELLED' }).eq('id', id).select().single()
    setSaving(false)
    if (error) { setError(error.message); return }
    setAuction(data); setNotice(t('Subasta cancelada.', 'Auction cancelled.'))
  }

  if (loading) return <InlineLoading description={t('Cargando…', 'Loading…')} />
  const sel = artworks.find((a) => a.id === form.artwork_id)
  const grid = { display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }
  const section = { display: 'grid', gap: '1rem', padding: '1.5rem 0', borderTop: '1px solid var(--cds-border-subtle)' }

  return (
    <div style={{ maxWidth: 1040, display: 'grid', gap: '1rem' }}>
      <Link href="/admin/auctions" style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', color: 'var(--jbu-purple)', fontSize: '.875rem' }}><ArrowLeft size={16} /> {t('Subastas', 'Auctions')}</Link>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 400, margin: 0 }}>{isNew ? t('Crear subasta', 'Create auction') : sel?.title || t('Subasta', 'Auction')}</h1>
        {auction && <Tag type="purple">{auction.status}</Tag>}
        {auction?.auction_event_id && <Link href={`/admin/auction-events/${auction.auction_event_id}`}><Tag type="cool-gray">{t('Lote', 'Lot')} {String(auction.lot_number || '').padStart(2, '0')} · {t('ver evento', 'view event')}</Tag></Link>}
      </header>
      {error && <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title={notice} onCloseButtonClick={() => setNotice('')} />}
      {locked && <InlineNotification kind="info" lowContrast hideCloseButton title={t('La subasta ya empezó o terminó; solo puedes consultarla o cancelarla.', 'The auction has started or ended; you can only review or cancel it.')} />}

      {auction && (
        <section style={{ ...section, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {[[t('Puja actual', 'Current bid'), formatMXN(auction.current_bid ?? auction.starting_bid, locale)], [t('Pujas', 'Bids'), auction.bid_count], [t('Seguidores', 'Watchers'), watchers], [t('Reserva', 'Reserve'), auction.reserve_price ? formatMXN(auction.reserve_price, locale) : '—'], [t('Pago', 'Payment'), auction.payment_status]].map(([l, v]) => (
            <div key={l}><p style={{ margin: 0, fontSize: '.75rem', color: 'var(--cds-text-secondary)' }}>{l}</p><p style={{ margin: '.25rem 0 0', fontSize: '1.25rem' }}>{v}</p></div>
          ))}
        </section>
      )}

      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '1rem' }}>
        <section style={section}>
          <ComboBox id="artwork" titleText={t('Obra', 'Artwork')} items={artworkItems} itemToString={(i) => i?.text || ''} selectedItem={artworkItems.find((i) => i.id === form.artwork_id) || null} onChange={({ selectedItem }) => set('artwork_id', selectedItem?.id || '')} placeholder={t('Busca por título o SKU', 'Search by title or SKU')} disabled={locked || hasBids} />
          <div style={grid}>
            <TextInput id="starts_at" type="datetime-local" labelText={t('Inicio', 'Start')} value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
            <TextInput id="ends_at" type="datetime-local" labelText={t('Fin', 'End')} value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} />
          </div>
        </section>
        <section style={section}>
          <div style={grid}>
            <NumberInput id="starting_bid" label={t('Puja inicial (MXN)', 'Starting bid (MXN)')} min={1} step={500} value={form.starting_bid} onChange={(_, { value }) => set('starting_bid', value)} />
            <NumberInput id="minimum_increment" label={t('Incremento mínimo (MXN)', 'Minimum increment (MXN)')} min={1} step={100} value={form.minimum_increment} onChange={(_, { value }) => set('minimum_increment', value)} />
            <TextInput id="reserve_price" type="number" labelText={t('Precio de reserva (confidencial)', 'Reserve price (confidential)')} helperText={t('Nunca se muestra al público.', 'Never shown publicly.')} value={String(form.reserve_price)} onChange={(e) => set('reserve_price', e.target.value)} />
            <TextInput id="buy_now_price" type="number" labelText={t('Comprar ya (opcional)', 'Buy now (optional)')} value={String(form.buy_now_price)} onChange={(e) => set('buy_now_price', e.target.value)} />
          </div>
        </section>
        <section style={section}>
          <div style={{ ...grid, alignItems: 'end' }}>
            <Checkbox id="anti" labelText={t('Extender si hay pujas al final (anti-sniping)', 'Extend on late bids (anti-sniping)')} checked={form.anti_sniping_enabled} onChange={(_, { checked }) => set('anti_sniping_enabled', checked)} />
            <NumberInput id="extension_minutes" label={t('Minutos de extensión', 'Extension minutes')} min={1} max={60} value={form.extension_minutes} onChange={(_, { value }) => set('extension_minutes', value)} />
            <NumberInput id="payment_window_hours" label={t('Plazo de pago del ganador (horas)', 'Winner payment window (hours)')} min={1} max={720} value={form.payment_window_hours} onChange={(_, { value }) => set('payment_window_hours', value)} />
          </div>
        </section>
      </fieldset>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', padding: '1rem 0', borderTop: '1px solid var(--cds-border-subtle)' }}>
        {!locked && <Button kind="secondary" renderIcon={Save} disabled={saving} onClick={() => save(null)}>{t('Guardar borrador', 'Save draft')}</Button>}
        {(!auction || auction.status === 'DRAFT') && <Button renderIcon={Rocket} disabled={saving} onClick={() => save('UPCOMING')}>{t('Publicar', 'Publish')}</Button>}
        <Button kind="ghost" renderIcon={View} onClick={() => setPreview(true)}>{t('Vista previa', 'Preview')}</Button>
        {auction && ['DRAFT', 'UPCOMING', 'LIVE'].includes(auction.status) && <Button kind="danger--ghost" renderIcon={Close} disabled={saving} onClick={() => setConfirmCancel(true)}>{t('Cancelar subasta', 'Cancel auction')}</Button>}
        {auction && auction.status !== 'DRAFT' && <Link href={`/admin/auctions/${auction.id}/promote`}><Button kind="tertiary" renderIcon={Share}>{auction.auction_event_id ? t('Compartir / promocionar lote', 'Share / promote lot') : t('Compartir / promocionar', 'Share / promote')}</Button></Link>}
        {sel && <Link href={`/artwork/${sel.sku}`} target="_blank"><Button kind="ghost">{t('Ver ficha pública', 'View public page')}</Button></Link>}
      </div>

      {auction && (
        <section style={section}>
          <h2 style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>{t('Historial de pujas (solo admin)', 'Bid history (admin only)')}</h2>
          {bids.length === 0 ? <p style={{ color: 'var(--cds-text-secondary)' }}>{t('Sin pujas.', 'No bids.')}</p> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {bids.map((b, i) => (
                <li key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem 1rem', padding: '.5rem 0', borderBottom: '1px solid var(--cds-border-subtle)', fontSize: '.875rem' }}>
                  <span style={{ fontWeight: 500 }}>{b.alias}</span><span>{b.email}</span>
                  <span style={{ marginLeft: 'auto' }}>{formatMXN(b.amount, locale)}</span>
                  <span style={{ color: 'var(--cds-text-secondary)' }}>{new Date(b.created_at).toLocaleString(locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal open={preview} passiveModal onRequestClose={() => setPreview(false)} modalHeading={t('Vista previa', 'Preview')}>
        <div style={{ display: 'grid', gap: '.5rem', paddingBottom: '1rem' }}>
          <p style={{ margin: 0, fontSize: '.75rem', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--jbu-purple)' }}>{t('Próxima subasta', 'Upcoming auction')}</p>
          <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 300 }}>{sel?.title || '—'}</p>
          <p style={{ margin: 0 }}>{t('Puja inicial', 'Starting bid')} · {formatMXN(form.starting_bid, locale)}</p>
          {form.buy_now_price !== '' && <p style={{ margin: 0 }}>{t('Comprar ya', 'Buy now')} · {formatMXN(form.buy_now_price, locale)}</p>}
          <p style={{ margin: 0, color: 'var(--cds-text-secondary)' }}>{form.starts_at && new Date(form.starts_at).toLocaleString(locale)} → {form.ends_at && new Date(form.ends_at).toLocaleString(locale)}</p>
          <p style={{ margin: 0, color: 'var(--cds-text-secondary)' }}>{form.reserve_price !== '' ? t('El público verá "Reserva no alcanzada / alcanzada", nunca el monto.', 'The public sees "Reserve not met / met", never the amount.') : t('Sin reserva.', 'No reserve.')}</p>
        </div>
      </Modal>
      <Modal open={confirmCancel} danger modalHeading={t('¿Cancelar la subasta?', 'Cancel the auction?')} primaryButtonText={t('Sí, cancelar', 'Yes, cancel')} secondaryButtonText={t('Volver', 'Back')} onRequestClose={() => setConfirmCancel(false)} onRequestSubmit={cancel}>
        <p>{hasBids ? t('Esta subasta ya tiene pujas. Al cancelarla se detiene y nadie gana; el historial se conserva.', 'This auction already has bids. Cancelling stops it and no one wins; history is kept.') : t('La subasta dejará de mostrarse.', 'The auction will no longer be shown.')}</p>
      </Modal>
    </div>
  )
}
