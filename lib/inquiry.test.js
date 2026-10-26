import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveInquiryChannel,
  resolveWhatsappNumber,
  buildPriceInquiryMessage,
  whatsappInquiryUrl,
  inquiryArtworkUrl,
} from './inquiry.js'

const artwork = { title: 'Quantum Drift', sku: 'JBU-001' }

test('canal por defecto es WHATSAPP cuando no hay configuración válida', () => {
  assert.equal(resolveInquiryChannel(null), 'WHATSAPP')
  assert.equal(resolveInquiryChannel({}), 'WHATSAPP')
  assert.equal(resolveInquiryChannel({ inquiry_channel: 'OTRO' }), 'WHATSAPP')
  assert.equal(resolveInquiryChannel({ inquiry_channel: 'EMAIL' }), 'EMAIL')
  assert.equal(resolveInquiryChannel({ inquiry_channel: 'internal' }), 'INTERNAL')
})

test('número de WhatsApp se normaliza a dígitos y tiene respaldo', () => {
  assert.equal(resolveWhatsappNumber({ whatsapp_number: '+52 81 2351 8298' }), '528123518298')
  assert.equal(resolveWhatsappNumber({ whatsapp_number: '' }), '528123518298')
  assert.equal(resolveWhatsappNumber(null), '528123518298')
})

test('mensaje de consulta incluye título, SKU y URL, nunca precio', () => {
  const url = inquiryArtworkUrl(artwork.sku)
  const msg = buildPriceInquiryMessage({ title: artwork.title, sku: artwork.sku, url, locale: 'es' })
  assert.match(msg, /consultar el precio/)
  assert.match(msg, /Quantum Drift/)
  assert.match(msg, /JBU-001/)
  assert.match(msg, /https:\/\/www\.josuebeltranuresti\.com\/artwork\/JBU-001/)
  assert.doesNotMatch(msg, /\$\d/)
  assert.doesNotMatch(msg, /MXN/)
})

test('mensaje en inglés usa la misma estructura', () => {
  const msg = buildPriceInquiryMessage({ title: artwork.title, sku: artwork.sku, locale: 'en' })
  assert.match(msg, /consultar el precio/)
  assert.match(msg, /Quantum Drift/)
})

test('URL de WhatsApp apunta al número configurado con el mensaje codificado', () => {
  const link = whatsappInquiryUrl({
    title: artwork.title,
    sku: artwork.sku,
    url: inquiryArtworkUrl(artwork.sku),
    settings: { whatsapp_number: '+52 81 2351 8298' },
  })
  assert.match(link, /^https:\/\/wa\.me\/528123518298\?text=/)
  const text = decodeURIComponent(link.split('?text=')[1])
  assert.match(text, /Quantum Drift/)
  assert.match(text, /JBU-001/)
  assert.doesNotMatch(text, /MXN/)
})

test('la URL de la obra es la canónica pública', () => {
  assert.equal(inquiryArtworkUrl('JBU-001'), 'https://www.josuebeltranuresti.com/artwork/JBU-001')
})
