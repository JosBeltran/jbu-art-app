// Compartir y distribución de obras — Fase 1.
// Todo apunta a la URL canónica pública de la ficha; nunca a URLs crudas de storage ni IDs internos.

export const SITE_URL = 'https://www.josuebeltranuresti.com'

// Canales registrados en analítica (artwork_share_events.channel).
export const SHARE_CHANNELS = ['native', 'whatsapp', 'pinterest', 'facebook', 'copy_link', 'x']

export function artworkUrl(sku) {
  return `${SITE_URL}/artwork/${encodeURIComponent(String(sku || '').trim())}`
}

// Mensaje bilingüe para WhatsApp y share nativo.
// El precio solo se incluye si la obra está disponible y tiene precio público.
export function shareMessage({ title, price = null, available = false, locale = 'es' } = {}) {
  const en = String(locale).startsWith('en')
  const byline = en ? 'Original artwork by Josué Beltrán Uresti' : 'Obra original de Josué Beltrán Uresti'
  const lines = [String(title || '').trim(), byline]
  if (available && Number(price) > 0) {
    lines.push(`$${Number(price).toLocaleString(en ? 'en-US' : 'es-MX')} MXN`)
  }
  return lines.filter(Boolean).join('\n')
}

export function whatsappUrl({ title, url, price = null, available = false, locale = 'es' } = {}) {
  const text = `${shareMessage({ title, price, available, locale })}\n${url}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
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
