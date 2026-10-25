import { supabase } from './supabaseClient'
import { authHeaders } from './authHeaders'

export const OPEN_STATUSES = ['UPCOMING', 'LIVE']

export function formatMXN(value, locale = 'es-MX') {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `MXN $${n.toLocaleString(locale, { maximumFractionDigits: 0 })}`
}

/** Diferencia entre el reloj del servidor y el del dispositivo (ms). */
export function clockOffset(row) {
  if (!row?.server_now) return 0
  return new Date(row.server_now).getTime() - Date.now()
}

/** Subasta más relevante de una obra (abierta, o ganada pendiente de pago). */
export async function fetchArtworkAuction(artworkId) {
  if (!artworkId) return null
  try {
    await supabase.rpc('settle_auctions', { _auction: null })
  } catch { /* la migración puede no existir aún */ }
  const { data, error } = await supabase
    .from('auctions_public')
    .select('*')
    .eq('artwork_id', artworkId)
    .order('starts_at', { ascending: false })
    .limit(1)
  if (error || !data?.length) return null
  return data[0]
}

export async function fetchAuction(id) {
  await supabase.rpc('settle_auctions',{_auction:id})
  const { data } = await supabase.from('auctions_public').select('*').eq('id', id).maybeSingle()
  return data || null
}

export async function fetchBidHistory(id, limit = 30) {
  const { data } = await supabase.rpc('auction_bid_history', { _auction: id, _limit: limit })
  return data || []
}

export async function fetchMyState(id) {
  const { data } = await supabase.rpc('my_auction_state', { _auction: id })
  return Array.isArray(data) ? data[0] || null : data
}

export async function placeBid(id, amount) {
  const { data, error } = await supabase.rpc('place_bid', { _auction: id, _amount: amount })
  if (error) return { ok: false, message: error.message }
  return Array.isArray(data) ? data[0] : data
}

export async function watchAuction(id, userId) {
  return supabase.from('auction_watchers').insert({ auction_id: id, user_id: userId })
}
export async function unwatchAuction(id, userId) {
  return supabase.from('auction_watchers').delete().eq('auction_id', id).eq('user_id', userId)
}

/** Escucha cambios de una (o todas) las subastas sin exponer datos sensibles. */
export function subscribeAuctionTicks(id, onTick) {
  const channel = supabase
    .channel(`auction-${id || 'all'}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_ticks', ...(id ? { filter: `auction_id=eq.${id}` } : {}) }, () => onTick())
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export async function startAuctionCheckout(id, kind) {
  const res = await fetch(`/api/auctions/${id}/${kind === 'buy_now' ? 'buy-now' : 'pay'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.url) throw new Error(json.error || 'No se pudo iniciar el pago')
  window.location.href = json.url
}

export function bidErrorText(code, t) {
  const map = {
    AUTH_REQUIRED: t('Inicia sesión para pujar.', 'Sign in to bid.'),
    NOT_LIVE: t('La subasta no está abierta en este momento.', 'The auction is not open right now.'),
    NOT_AVAILABLE: t('Esta obra ya no está disponible.', 'This artwork is no longer available.'),
    TOO_LOW: t('Tu puja es menor a la mínima permitida.', 'Your bid is below the minimum allowed.'),
    ALREADY_LEADING: t('Ya tienes la puja más alta.', 'You already have the highest bid.'),
    NOT_FOUND: t('Subasta no encontrada.', 'Auction not found.'),
  }
  return map[code] || code || t('No se pudo registrar la puja.', 'The bid could not be placed.')
}
