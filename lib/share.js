// Compartir y distribución de obras — Fase 1.
// Todo apunta a la URL canónica pública de la ficha; nunca a URLs crudas de storage ni IDs internos.

import { SITE_URL } from './seo.js'
export { SITE_URL }

// Canales registrados en analítica (artwork_share_events.channel).
export const SHARE_CHANNELS = ['native', 'whatsapp', 'pinterest', 'facebook', 'copy_link', 'x']

export function artworkUrl(sku) {
  return `${SITE_URL}/artwork/${encodeURIComponent(String(sku || '').trim())}`
}

// Sharing is editorial: prices never enter social messages or image captions.
export function shareMessage({ title, artist = '' } = {}) {
  return [String(title || '').trim(), String(artist || '').trim()].filter(Boolean).join(' — ')
}

export function whatsappUrl({ title, url, artist = '', locale = 'es' } = {}) {
  const text = `${shareMessage({ title, artist, locale })}\n${url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function linkedinUrl(url) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
}

// Pinterest Save: sin OAuth. El destino siempre es la ficha canónica, nunca la imagen cruda.
export function pinterestUrl({ url, image = null, title, description = '' } = {}) {
  const params = new URLSearchParams({ url })
  if (image) params.set('media', image)
  params.set('description', [title, description].filter(Boolean).join(' — ').slice(0, 500))
  return `https://pinterest.com/pin/create/button/?${params.toString()}`
}

export function facebookUrl(url) {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
}

export function xUrl({ url, title } = {}) {
  const params = new URLSearchParams({ url, text: String(title || '') })
  return `https://twitter.com/intent/tweet?${params.toString()}`
}
