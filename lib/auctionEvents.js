import { supabase } from './supabaseClient'

const SITE = 'https://www.josuebeltranuresti.com'
const OPEN = ['UPCOMING', 'LIVE']

export const lotLabel = (n) => `${String(n || 0).padStart(2, '0')}`

export async function fetchEventBySlug(slug) {
  const { data, error } = await supabase.from('auction_events_public').select('*').eq('slug', slug).maybeSingle()
  if (error) return null
  return data || null
}

export async function fetchEventById(id) {
  const { data } = await supabase.from('auction_events_public').select('*').eq('id', id).maybeSingle()
  return data || null
}

/** Lotes publicados del evento, con su obra. Solo datos públicos (vista sin reserva ni identidades). */
export async function fetchEventLots(eventId) {
  const { data: lots, error } = await supabase.from('auctions_public').select('*').eq('auction_event_id', eventId).order('lot_number', { ascending: true })
  if (error || !lots?.length) return []
  const { data: arts } = await supabase.from('artworks').select('*').in('id', lots.map((l) => l.artwork_id))
  const byId = new Map((arts || []).map((a) => [a.id, a]))
  return lots.filter((l) => byId.has(l.artwork_id)).map((l) => ({ auction: l, artwork: byId.get(l.artwork_id) }))
}

export async function refreshAuctions() {
  try { await supabase.rpc('settle_auctions', { _auction: null }) } catch { /* sin migración */ }
}

export async function isWatchingEvent(eventId, userId) {
  if (!userId) return false
  const { data } = await supabase.from('auction_event_watchers').select('id').eq('auction_event_id', eventId).eq('user_id', userId).maybeSingle()
  return Boolean(data)
}
export const watchEvent = (eventId, userId) => supabase.from('auction_event_watchers').insert({ auction_event_id: eventId, user_id: userId })
export const unwatchEvent = (eventId, userId) => supabase.from('auction_event_watchers').delete().eq('auction_event_id', eventId).eq('user_id', userId)

/**
 * Clasifica lotes con los ends_at REALES (incluye extensiones anti-sniping).
 * Varios lotes pueden seguir abiertos a la vez; nunca se asume cerrado un lote extendido.
 */
export function classifyLots(items, nowMs) {
  const open = items.filter((i) => OPEN.includes(i.auction.status) && new Date(i.auction.ends_at).getTime() > nowMs)
    .sort((a, b) => new Date(a.auction.ends_at) - new Date(b.auction.ends_at))
  const closed = items.filter((i) => !open.includes(i))
    .sort((a, b) => new Date(b.auction.ends_at) - new Date(a.auction.ends_at))
  const WINDOW = 10 * 60 * 1000
  const closingNow = open.filter((i) => new Date(i.auction.ends_at).getTime() - nowMs <= WINDOW)
  const current = closingNow.length ? closingNow : open.slice(0, 1)
  const next = open.filter((i) => !current.includes(i)).slice(0, 3)
  return { open, closed, current, next, recentlyClosed: closed.slice(0, 6) }
}

export const isExtended = (a) => Number(a?.extended_count) > 0

/** Objetos limpios reutilizables para el futuro Share & Promote Studio. Sin datos privados. */
export function toEventPromo(event, items = []) {
  return {
    type: 'EVENT',
    id: event.id,
    name: event.name,
    subtitle: event.subtitle || '',
    description: event.description || '',
    url: `${SITE}/auctions/${event.slug}`,
    cover_image_url: event.cover_image_url || items[0]?.artwork?.primary_image_url || null,
    starts_at: event.starts_at,
    closing_starts_at: event.closing_starts_at || event.first_close_at || null,
    status: event.effective_status,
    lot_count: event.lot_count ?? items.length,
    preview_images: items.slice(0, 6).map((i) => i.artwork.primary_image_url).filter(Boolean),
  }
}

export function toLotPromo(event, item) {
  const a = item.auction
  return {
    type: 'LOT',
    event_id: event?.id || null,
    event_name: event?.name || null,
    lot_number: a.lot_number,
    auction_id: a.id,
    artwork_title: item.artwork.title,
    image_url: item.artwork.primary_image_url || null,
    url: `${SITE}/artwork/${item.artwork.sku}`,
    current_bid: a.current_bid,
    starting_bid: a.starting_bid,
    bid_count: a.bid_count,
    ends_at: a.ends_at,
    status: a.status,
  }
}
