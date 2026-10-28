/**
 * Feed de Google Merchant Center — lógica pura.
 *
 * Reglas de elegibilidad: reutiliza el catálogo público (status + Serie
 * activa vía homeSeries) y la presentación comercial compartida
 * (artworkCommerce). Solo entran obras comprables con precio visible;
 * vendidas, «Consultar precio», sin precio o sin imagen quedan fuera.
 *
 * La fuente de verdad sigue siendo la tabla artworks: aquí no se crea
 * ningún catálogo ni precio paralelo.
 */

import { SITE_URL, absoluteUrl } from './seo.js'
import { getArtworkCommercePresentation, getPriceDisplayMode } from './artworkCommerce.js'
import { getAvailability } from './artworkStatus.js'
import { belongsToSeries, isHomeEligible } from './homeSeries.js'

export const FEED_PATH = '/google-merchant.xml'
export const FEED_URL = absoluteUrl(FEED_PATH)
export const FEED_CURRENCY = 'MXN'
export const FEED_BRAND = 'JBU'
export const FEED_CHANNEL_TITLE = 'JBU — Josué Beltrán Uresti'
export const FEED_CHANNEL_DESCRIPTION = 'Original contemporary artworks by Josué Beltrán Uresti'

export const EXCLUSION_REASONS = [
  'DRAFT',
  'HIDDEN',
  'INACTIVE_SERIES',
  'SOLD',
  'PRICE_ON_REQUEST',
  'NO_PRICE',
  'MISSING_IMAGE',
  'NO_PUBLIC_PAGE',
]

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Escape XML obligatorio: títulos y descripciones pueden llevar &, <, >, comillas, acentos y em dash. */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** g:id estable: SKU → código de obra → UUID. Nunca un valor aleatorio. */
export function feedItemId(artwork) {
  return clean(artwork?.sku) || clean(artwork?.code) || clean(artwork?.id)
}

/** g:title: inglés si ya existe localización, si no el título original. */
export function feedTitle(artwork) {
  return clean(artwork?.title_en) || clean(artwork?.title)
}

/**
 * g:description: descripción en inglés → descripción original → síntesis de
 * metadatos existentes (título, serie, año, medio, técnica, dimensiones).
 * Nunca inventa información que no esté guardada.
 */
export function feedDescription(artwork) {
  const direct = clean(artwork?.description_en) || clean(artwork?.description)
  if (direct) return direct
  return [
    clean(artwork?.title),
    clean(artwork?.series),
    clean(artwork?.year),
    clean(artwork?.medium_en) || clean(artwork?.medium),
    clean(artwork?.technique_en) || clean(artwork?.technique),
    clean(artwork?.dimensions),
  ]
    .filter(Boolean)
    .join(', ')
}

/** URL de imagen absoluta HTTPS; rutas locales se resuelven contra el dominio canónico. */
export function absoluteImageUrl(url) {
  const u = clean(url)
  if (!u) return ''
  if (/^https:\/\//i.test(u)) return u
  if (u.startsWith('/')) return absoluteUrl(u)
  return ''
}

/**
 * Imagen principal + adicionales (secondary_images y filas de artwork_images,
 * en su orden). La principal nunca se duplica y los videos no entran al feed.
 */
export function feedImages(artwork, imageRows = []) {
  const main = absoluteImageUrl(artwork?.primary_image_url)
  const seen = new Set(main ? [main] : [])
  const additional = []
  const push = (url) => {
    const abs = absoluteImageUrl(url)
    if (!abs || seen.has(abs)) return
    seen.add(abs)
    additional.push(abs)
  }
  ;(artwork?.secondary_images || []).forEach(push)
  ;[...(imageRows || [])]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .forEach((row) => {
      const isVideo =
        row?.media_type === 'video' || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(row?.image_url || '')
      if (!isVideo) push(row?.image_url)
    })
  return { main, additional }
}

/** g:price con formato estricto «14900.00 MXN»: sin $, comas ni separadores locales. */
export function feedPrice(artwork) {
  const { price } = getArtworkCommercePresentation(artwork)
  if (price === null) return null
  return `${price.toFixed(2)} ${FEED_CURRENCY}`
}

export function seriesForArtwork(artwork, seriesRows = []) {
  return (seriesRows || []).find((row) => belongsToSeries(artwork, row)) || null
}

/**
 * Motivo de exclusión del feed, o null si la obra es elegible.
 * Orden de diagnóstico: publicación → página pública → serie →
 * disponibilidad → modo de precio → precio → imagen.
 */
export function feedExclusionReason(artwork, seriesRows = [], now = new Date()) {
  if (!artwork) return 'DRAFT'
  const status = String(artwork.status || '').toUpperCase()
  if (!['AVAILABLE', 'OWNED'].includes(status)) return status === 'DRAFT' ? 'DRAFT' : 'HIDDEN'
  if (!clean(artwork.sku)) return 'NO_PUBLIC_PAGE'
  if (!isHomeEligible(artwork, seriesRows, now)) return 'INACTIVE_SERIES'
  if (getAvailability(artwork) !== 'AVAILABLE') return 'SOLD'
  if (getPriceDisplayMode(artwork) === 'CONTACT_FOR_PRICE') return 'PRICE_ON_REQUEST'
  if (feedPrice(artwork) === null) return 'NO_PRICE'
  if (!absoluteImageUrl(artwork.primary_image_url)) return 'MISSING_IMAGE'
  return null
}

export function isFeedEligible(artwork, seriesRows = [], now = new Date()) {
  return feedExclusionReason(artwork, seriesRows, now) === null
}

/** Mapeo obra → atributos Google Merchant (item ya elegible). */
export function buildFeedItem(artwork, seriesRows = [], imageRows = []) {
  const series = seriesForArtwork(artwork, seriesRows)
  const { main, additional } = feedImages(artwork, imageRows)
  const medium = clean(artwork?.medium_en) || clean(artwork?.medium) || 'Painting'
  return {
    id: feedItemId(artwork),
    title: feedTitle(artwork),
    description: feedDescription(artwork),
    link: absoluteUrl(`/artwork/${encodeURIComponent(clean(artwork.sku))}`),
    image_link: main,
    additional_image_links: additional,
    availability: 'in_stock',
    price: feedPrice(artwork),
    condition: 'new',
    brand: FEED_BRAND,
    identifier_exists: 'no',
    product_type: `Art > Original Art > ${medium}`,
    custom_label_0: clean(series?.title) || clean(artwork?.series) || null,
    custom_label_1: 'Original Artwork',
  }
}

function gTag(name, value) {
  if (value === null || value === undefined || value === '') return ''
  return `      <g:${name}>${escapeXml(value)}</g:${name}>\n`
}

/** RSS 2.0 con namespace Google Merchant, UTF-8. */
export function buildMerchantFeed(items = []) {
  const body = (items || [])
    .map((item) => {
      let xml = '    <item>\n'
      xml += gTag('id', item.id)
      xml += gTag('title', item.title)
      xml += gTag('description', item.description)
      xml += gTag('link', item.link)
      xml += gTag('image_link', item.image_link)
      for (const extra of item.additional_image_links || []) xml += gTag('additional_image_link', extra)
      xml += gTag('availability', item.availability)
      xml += gTag('price', item.price)
      xml += gTag('condition', item.condition)
      xml += gTag('brand', item.brand)
      xml += gTag('identifier_exists', item.identifier_exists)
      xml += gTag('product_type', item.product_type)
      xml += gTag('custom_label_0', item.custom_label_0)
      xml += gTag('custom_label_1', item.custom_label_1)
      xml += '    </item>\n'
      return xml
    })
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(FEED_CHANNEL_TITLE)}</title>\n` +
    `    <link>${escapeXml(SITE_URL)}</link>\n` +
    `    <description>${escapeXml(FEED_CHANNEL_DESCRIPTION)}</description>\n` +
    body +
    `  </channel>\n</rss>\n`
  )
}
