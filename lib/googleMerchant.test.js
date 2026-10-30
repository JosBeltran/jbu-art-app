import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  escapeXml,
  feedItemId,
  feedTitle,
  feedDescription,
  absoluteImageUrl,
  feedImages,
  feedPrice,
  feedExclusionReason,
  isFeedEligible,
  buildFeedItem,
  buildMerchantFeed,
  FEED_URL,
  FEED_ARTWORK_FIELDS,
} from './googleMerchant.js'

const eligible = {
  id: '11111111-2222-3333-4444-555555555555',
  sku: 'JBU-OG-001',
  status: 'AVAILABLE',
  availability_status: 'AVAILABLE',
  ownership_status: 'AVAILABLE',
  price_display_mode: 'SHOW_PRICE',
  base_price_mxn: 14900,
  calculated_price_mxn: 14900,
  title: 'Geología Urbana I — Violeta',
  title_en: 'Urban Geology I — Violet',
  description: 'Obra original con acentos & símbolos <especiales>.',
  medium: 'Óleo sobre lienzo',
  medium_en: 'Oil on canvas',
  year: '2024',
  dimensions: '100 × 120 cm',
  series: 'Geología Urbana',
  primary_image_url: 'https://cdn.example.com/og-001.webp',
}

const activeSeries = [{ id: 's1', title: 'Geología Urbana', editorial_status: 'active' }]

test('Merchant projection uses existing production columns, not legacy object aliases', () => {
  const fields = FEED_ARTWORK_FIELDS.split(',').map((field) => field.trim())
  for (const absent of ['code', 'technique', 'secondary_images']) {
    assert.equal(fields.includes(absent), false, `${absent} does not exist in production`)
  }
  for (const required of ['sku', 'medium', 'technique_en', 'primary_image_url', 'price_display_mode', 'availability_status', 'series_id']) {
    assert.equal(fields.includes(required), true, `${required} must remain verified`)
  }
})

test('escapeXml escapa &, <, >, comillas y conserva acentos y em dash', () => {
  assert.equal(escapeXml('A & B <C> "D" \'E\''), 'A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;')
  assert.equal(escapeXml('Geología — Violeta'), 'Geología — Violeta')
})

test('g:id prioriza SKU, luego código, luego UUID; nunca aleatorio', () => {
  assert.equal(feedItemId(eligible), 'JBU-OG-001')
  assert.equal(feedItemId({ ...eligible, sku: null, code: 'OG-001' }), 'OG-001')
  assert.equal(feedItemId({ ...eligible, sku: null, code: null }), eligible.id)
})

test('g:title prefiere la localización en inglés existente', () => {
  assert.equal(feedTitle(eligible), 'Urban Geology I — Violet')
  assert.equal(feedTitle({ ...eligible, title_en: null }), 'Geología Urbana I — Violeta')
})

test('g:description prefiere inglés, luego español, luego metadatos existentes', () => {
  assert.equal(feedDescription({ ...eligible, description_en: 'EN text' }), 'EN text')
  assert.equal(feedDescription(eligible), eligible.description)
  const meta = feedDescription({ ...eligible, description: null, description_en: null })
  assert.equal(meta, 'Geología Urbana I — Violeta, Geología Urbana, 2024, Oil on canvas, 100 × 120 cm')
})

test('imágenes: absolutas HTTPS; relativas se resuelven al dominio canónico; http se descarta', () => {
  assert.equal(absoluteImageUrl('https://cdn.example.com/a.webp'), 'https://cdn.example.com/a.webp')
  assert.equal(absoluteImageUrl('/images/a.webp'), 'https://www.josuebeltranuresti.com/images/a.webp')
  assert.equal(absoluteImageUrl('http://inseguro.example.com/a.webp'), '')
  assert.equal(absoluteImageUrl(''), '')
})

test('imágenes adicionales: sin duplicar la principal y sin videos', () => {
  const rows = [
    { image_url: 'https://cdn.example.com/extra-b.webp', media_type: 'image', display_order: 2 },
    { image_url: 'https://cdn.example.com/extra-a.webp', media_type: 'image', display_order: 1 },
    { image_url: 'https://cdn.example.com/video.mp4', media_type: 'video', display_order: 0 },
    { image_url: 'https://cdn.example.com/og-001.webp', media_type: 'image', display_order: 3 },
  ]
  const { main, additional } = feedImages({ ...eligible, secondary_images: ['https://cdn.example.com/sec.webp'] }, rows)
  assert.equal(main, 'https://cdn.example.com/og-001.webp')
  assert.deepEqual(additional, [
    'https://cdn.example.com/sec.webp',
    'https://cdn.example.com/extra-a.webp',
    'https://cdn.example.com/extra-b.webp',
  ])
})

test('g:price con formato estricto «14900.00 MXN»', () => {
  assert.equal(feedPrice(eligible), '14900.00 MXN')
  assert.equal(feedPrice({ ...eligible, calculated_price_mxn: 99.5 }), '99.50 MXN')
})

test('elegible: obra pública, disponible, precio visible e imagen', () => {
  assert.equal(feedExclusionReason(eligible, activeSeries), null)
  assert.equal(isFeedEligible(eligible, activeSeries), true)
})

test('excluidas: vendida, oculta, borrador, serie inactiva, consultar precio, sin precio, sin imagen, sin SKU', () => {
  assert.equal(feedExclusionReason({ ...eligible, availability_status: 'SOLD' }, activeSeries), 'SOLD')
  assert.equal(feedExclusionReason({ ...eligible, ownership_status: 'SOLD', availability_status: null }, activeSeries), 'SOLD')
  assert.equal(feedExclusionReason({ ...eligible, status: 'DRAFT' }, activeSeries), 'DRAFT')
  assert.equal(feedExclusionReason({ ...eligible, status: 'ARCHIVED' }, activeSeries), 'HIDDEN')
  assert.equal(
    feedExclusionReason(eligible, [{ ...activeSeries[0], editorial_status: 'coming_soon' }]),
    'INACTIVE_SERIES'
  )
  assert.equal(
    feedExclusionReason(eligible, [{ ...activeSeries[0], editorial_status: 'archived' }]),
    'INACTIVE_SERIES'
  )
  assert.equal(feedExclusionReason({ ...eligible, price_display_mode: 'CONTACT_FOR_PRICE' }, activeSeries), 'PRICE_ON_REQUEST')
  assert.equal(feedExclusionReason({ ...eligible, calculated_price_mxn: null, base_price_mxn: null }, activeSeries), 'NO_PRICE')
  assert.equal(feedExclusionReason({ ...eligible, primary_image_url: null }, activeSeries), 'MISSING_IMAGE')
  assert.equal(feedExclusionReason({ ...eligible, sku: null }, activeSeries), 'NO_PUBLIC_PAGE')
})

test('obra sin serie propia es elegible (serie opcional)', () => {
  const sinSerie = { ...eligible, series: null, series_id: null }
  assert.equal(feedExclusionReason(sinSerie, activeSeries), null)
})

test('buildFeedItem mapea todos los atributos Google Merchant', () => {
  const item = buildFeedItem(eligible, activeSeries, [
    { image_url: 'https://cdn.example.com/extra.webp', media_type: 'image', display_order: 1 },
  ])
  assert.equal(item.id, 'JBU-OG-001')
  assert.equal(item.title, 'Urban Geology I — Violet')
  assert.equal(item.link, 'https://www.josuebeltranuresti.com/artwork/JBU-OG-001')
  assert.equal(item.image_link, 'https://cdn.example.com/og-001.webp')
  assert.deepEqual(item.additional_image_links, ['https://cdn.example.com/extra.webp'])
  assert.equal(item.availability, 'in_stock')
  assert.equal(item.price, '14900.00 MXN')
  assert.equal(item.condition, 'new')
  assert.equal(item.brand, 'JBU')
  assert.equal(item.identifier_exists, 'no')
  assert.equal(item.product_type, 'Art > Original Art > Oil on canvas')
  assert.equal(item.custom_label_0, 'Geología Urbana')
  assert.equal(item.custom_label_1, 'Original Artwork')
})

test('el XML es RSS 2.0 con namespace Google Merchant y contenido escapado', () => {
  const item = buildFeedItem(eligible, activeSeries, [])
  const xml = buildMerchantFeed([item])
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.ok(xml.includes('<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">'))
  assert.ok(xml.includes('<g:id>JBU-OG-001</g:id>'))
  assert.ok(xml.includes('<g:price>14900.00 MXN</g:price>'))
  assert.ok(xml.includes('<g:availability>in_stock</g:availability>'))
  assert.ok(xml.includes('<g:identifier_exists>no</g:identifier_exists>'))
  // La descripción lleva & y < >: deben aparecer escapados, nunca crudos.
  assert.ok(xml.includes('acentos &amp; símbolos &lt;especiales&gt;'))
  assert.ok(!xml.includes('acentos & símbolos'))
  assert.ok(xml.trim().endsWith('</rss>'))
})

test('feed vacío sigue siendo XML válido', () => {
  const xml = buildMerchantFeed([])
  assert.ok(xml.includes('<channel>'))
  assert.ok(!xml.includes('<item>'))
})

test('la URL del feed usa el dominio canónico de producción', () => {
  assert.equal(FEED_URL, 'https://www.josuebeltranuresti.com/google-merchant.xml')
})
