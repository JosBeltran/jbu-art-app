/**
 * Consulta de precio («Ask for price» / «Consultar precio»).
 *
 * El canal lo decide la configuración del sitio (site_settings), no el
 * navegador del visitante: WHATSAPP abre un mensaje precargado; EMAIL e
 * INTERNAL pasan por la ruta de servidor /api/inquiries.
 *
 * Nunca incluye el precio en el mensaje ni en la URL.
 */

import { SITE_URL, artworkUrl } from './share.js'

export const INQUIRY_CHANNELS = ['WHATSAPP', 'EMAIL', 'INTERNAL']

const norm = (v) => String(v ?? '').trim().toUpperCase()

/** Canal de consulta configurado; WHATSAPP si la configuración no es válida. */
export function resolveInquiryChannel(settings) {
  const channel = norm(settings?.inquiry_channel)
  return INQUIRY_CHANNELS.includes(channel) ? channel : 'WHATSAPP'
}

/** Número de WhatsApp en formato internacional sin signos (wa.me). */
export function resolveWhatsappNumber(settings) {
  const digits = String(settings?.whatsapp_number || '').replace(/[^0-9]/g, '')
  return digits || '528123518298'
}

/**
 * Mensaje precargado bilingüe para la consulta de precio.
 * Incluye título, SKU y URL canónica de la obra; nunca el precio.
 */
export function buildPriceInquiryMessage({ title, sku, url, locale = 'es' } = {}) {
  const en = String(locale).startsWith('en')
  const lines = [
    en
      ? 'Hola, estoy interesado en consultar el precio de:'
      : 'Hola, estoy interesado en consultar el precio de:',
    String(title || '').trim(),
    sku ? String(sku).trim() : null,
    url || null,
  ]
  return lines.filter(Boolean).join('\n')
}

/** URL de WhatsApp con el mensaje de consulta precargado. */
export function whatsappInquiryUrl({ title, sku, url, locale = 'es', settings } = {}) {
  const text = buildPriceInquiryMessage({ title, sku, url, locale })
  return `https://wa.me/${resolveWhatsappNumber(settings)}?text=${encodeURIComponent(text)}`
}

/** URL canónica de la ficha de la obra (reutiliza la regla de compartir). */
export function inquiryArtworkUrl(sku) {
  return artworkUrl(sku)
}

export { SITE_URL }
