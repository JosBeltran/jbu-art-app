// Estudio de promoción: SOLO lectura del estado de subastas. Nunca escribe en auctions/auction_events.
import { supabase } from '@/lib/supabaseClient'
import { fetchEventById, fetchEventLots, toEventPromo, toLotPromo } from '@/lib/auctionEvents'

export const SITE = 'https://www.josuebeltranuresti.com'
export const SITE_LABEL = 'josuebeltranuresti.com'

/** Carga el objetivo EVENTO con lotes publicados (vista pública: sin reserva ni identidades). */
export async function loadEventTarget(eventId) {
  const event = await fetchEventById(eventId)
  if (!event) return null
  const items = await fetchEventLots(eventId)
  return { kind: 'EVENT', event, items, promo: toEventPromo(event, items) }
}

/** Carga el objetivo LOTE (o subasta individual) desde la vista pública. */
export async function loadLotTarget(auctionId) {
  const { data: auction } = await supabase.from('auctions_public').select('*').eq('id', auctionId).maybeSingle()
  if (!auction) return null
  const { data: artwork } = await supabase.from('artworks').select('*').eq('id', auction.artwork_id).maybeSingle()
  if (!artwork) return null
  const event = auction.auction_event_id ? await fetchEventById(auction.auction_event_id) : null
  const { data: hist } = await supabase.rpc('auction_bid_history', { _auction: auctionId, _limit: 1 })
  const item = { auction, artwork }
  return { kind: 'LOT', event, item, lastBidAt: hist?.[0]?.created_at || null, promo: toLotPromo(event, item) }
}

const H = 3600e3
/** Estado AUTO basado en tiempos reales. Sin urgencia falsa. */
export function autoStatus(target, now = Date.now()) {
  if (target.kind === 'EVENT') {
    const e = target.event
    const start = new Date(e.starts_at).getTime()
    const close = e.next_close_at ? new Date(e.next_close_at).getTime() : null
    if (e.effective_status === 'ENDED') return { key: 'ENDED', es: 'Subasta terminada', en: 'Auction ended' }
    if (e.effective_status === 'CANCELLED') return { key: 'CANCELLED', es: 'Subasta cancelada', en: 'Auction cancelled' }
    if (e.effective_status === 'CLOSING') return { key: 'CLOSING_NOW', es: 'Cerrando ahora', en: 'Closing now' }
    if (now < start) return start - now <= 24 * H && new Date(start).toDateString() !== new Date(now).toDateString()
      ? { key: 'OPENS_TOMORROW', es: 'La subasta abre mañana', en: 'Auction opens tomorrow' }
      : { key: 'UPCOMING', es: 'Próxima subasta', en: 'Upcoming auction' }
    if (close && new Date(close).toDateString() === new Date(now).toDateString()) return { key: 'ENDS_TODAY', es: 'Termina hoy', en: 'Ends today' }
    if (close && close - now <= 24 * H) return { key: 'FINAL_24', es: 'Últimas 24 horas', en: 'Final 24 hours' }
    return { key: 'LIVE', es: 'Subasta en vivo', en: 'Live auction' }
  }
  const a = target.item.auction
  const end = new Date(a.ends_at).getTime()
  if (a.status === 'SOLD') return { key: 'SOLD', es: 'Vendido', en: 'Sold' }
  if (!['LIVE', 'UPCOMING'].includes(a.status) || end <= now) return { key: 'ENDED', es: 'Lote cerrado', en: 'Lot closed' }
  if (a.status === 'UPCOMING' || now < new Date(a.starts_at).getTime()) return { key: 'LOT_UPCOMING', es: 'Próximo lote', en: 'Lot upcoming' }
  if (end - now <= 10 * 60e3) return { key: 'LOT_CLOSING', es: 'Lote cerrando ahora', en: 'Lot closing now' }
  if (target.lastBidAt && now - new Date(target.lastBidAt).getTime() <= H) return { key: 'NEW_HIGH', es: 'Nueva puja más alta', en: 'New highest bid' }
  if (end - now <= 3 * H) return { key: 'FINAL_HOURS', es: 'Últimas horas', en: 'Final hours' }
  if (end - now <= 24 * H) return { key: 'FINAL_24', es: 'Últimas 24 horas', en: 'Final 24 hours' }
  return { key: 'LOT_LIVE', es: 'Lote en vivo', en: 'Lot live' }
}

export const slugPart = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

/** URL pública con parámetros de campaña (UTM), compatibles con Vercel Analytics. */
export function trackedUrl(target, { campaign, source, medium }) {
  const base = target.kind === 'EVENT' ? target.promo.url : target.promo.url
  const content = target.kind === 'EVENT' ? 'event' : `lot_${String(target.item.auction.lot_number || 0).padStart(2, '0')}`
  const u = new URL(base)
  if (campaign) u.searchParams.set('utm_campaign', slugPart(campaign))
  if (source) u.searchParams.set('utm_source', source)
  u.searchParams.set('utm_medium', medium || 'social')
  u.searchParams.set('utm_content', content)
  return u.toString()
}

export function defaultCampaign(target) {
  const name = target.kind === 'EVENT' ? target.event.name : (target.event?.name || target.item.artwork.title)
  return slugPart(name)
}

export function fmtMXN(n) {
  const v = Number(n)
  return Number.isFinite(v) ? `MXN $${v.toLocaleString('es-MX', { maximumFractionDigits: 0 })}` : ''
}

export function fmtDateRange(startIso, endIso, lang) {
  const loc = lang === 'en' ? 'en-US' : 'es-MX'
  const s = new Date(startIso)
  const e = endIso ? new Date(endIso) : null
  const m = (d) => d.toLocaleDateString(loc, { month: 'long' })
  if (!e || s.toDateString() === e.toDateString()) return s.toLocaleDateString(loc, { month: 'long', day: 'numeric' })
  if (s.getMonth() === e.getMonth()) return lang === 'en' ? `${m(s)} ${s.getDate()}–${e.getDate()}` : `${s.getDate()}–${e.getDate()} de ${m(s)}`
  return `${s.toLocaleDateString(loc, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(loc, { month: 'short', day: 'numeric' })}`
}

export const fmtClose = (iso, lang) => new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : 'es-MX', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const lotNo = (n) => String(n || 0).padStart(2, '0')

/** Leyendas automáticas distintas para Evento y Lote. Hashtags limitados. */
export function buildCaption(target, url, lang) {
  const en = lang === 'en'
  if (target.kind === 'EVENT') {
    const e = target.event
    const n = e.lot_count ?? target.items.length
    const open = ['LIVE', 'CLOSING'].includes(e.effective_status)
    return [
      e.name,
      en ? `${n} original works available through online auction.` : `${n} obras originales disponibles en subasta en línea.`,
      open ? (en ? 'Bidding is now open.' : 'Las pujas están abiertas.') : (en ? `Bidding opens ${fmtClose(e.starts_at, lang)}.` : `Las pujas abren el ${fmtClose(e.starts_at, lang)}.`),
      '',
      en ? 'Explore all lots and participate online:' : 'Explora todos los lotes y participa en línea:',
      url,
      '',
      '#ContemporaryArt #ArtAuction #JBU',
    ].join('\n')
  }
  const { auction: a, artwork: w } = target.item
  const lotPrefix = a.lot_number ? `${en ? 'Lot' : 'Lote'} ${lotNo(a.lot_number)} — ` : ''
  const title = en ? (w.title_en || w.title) : w.title
  const open = a.status === 'LIVE'
  return [
    `${lotPrefix}${title}`,
    target.event ? target.event.name : null,
    open ? (en ? 'Bidding is now open.' : 'Las pujas están abiertas.') : (en ? `Bidding opens ${fmtClose(a.starts_at, lang)}.` : `Las pujas abren el ${fmtClose(a.starts_at, lang)}.`),
    '',
    en ? 'Current auction details and bidding:' : 'Detalles de la subasta y pujas:',
    url,
    '',
    '#ContemporaryArt #ArtAuction #JBU',
  ].filter((l) => l !== null).join('\n')
}
