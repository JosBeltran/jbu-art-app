import { getArtworkCommercePresentation } from './artworkCommerce.js'

export const TIDIO_SCRIPT_ID = 'tidio-chat-script'
export const TIDIO_SCRIPT_SRC = 'https://code.tidio.co/mjed9cy4yfk1dqg5dnt5xr89ii0dosqx.js'

export function canLoadTidio(pathname = '', consent = null) {
  return consent?.marketing === true && pathname !== '/admin' && !pathname.startsWith('/admin/')
}

const text = (value) => typeof value === 'string' ? value.trim().slice(0, 300) : ''
const campaign = (value) => /^[\p{L}\p{N} ._\-/]{1,120}$/u.test(value || '') ? value : ''

// Strip query strings/hash (auth tokens, email addresses, checkout IDs, etc.).
function publicUrl(value, originOnly = false) {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol)) return ''
    return originOnly ? url.origin : `${url.origin}${url.pathname}`
  } catch { return '' }
}

export function buildTidioContext({ artwork = null, language = 'es', url = '', referrer = '' } = {}) {
  const en = language === 'en'
  let params
  try { params = new URL(url).searchParams } catch { params = new URLSearchParams() }
  const commercial = getArtworkCommercePresentation(artwork)
  // An explicit public name only. Do not infer authorship from the collector/owner.
  const artist = text(artwork?.artist_name)
  return {
    artwork_id: artwork?.id ? String(artwork.id) : '',
    artwork_title: text((en && artwork?.title_en) || artwork?.title),
    artwork_sku: text(artwork?.sku),
    artwork_slug: text(artwork?.slug || artwork?.sku),
    artwork_series: text(artwork?.series),
    artwork_artist: artist,
    artwork_dimensions: text(artwork?.dimensions),
    artwork_price: artwork && commercial.showPrice ? String(commercial.price) : '',
    artwork_currency: artwork && commercial.showPrice ? 'MXN' : '',
    artwork_url: artwork ? publicUrl(url) : '',
    current_url: publicUrl(url),
    current_language: en ? 'en' : 'es',
    referrer: publicUrl(referrer, true),
    utm_source: campaign(params.get('utm_source')),
    utm_campaign: campaign(params.get('utm_campaign')),
  }
}