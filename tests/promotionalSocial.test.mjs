import test from 'node:test'
import assert from 'node:assert/strict'
import { promotionalMetadata, seriesSlug, findSeriesBySlug, normalizePromoSettings, publicImageUrl } from '../lib/social/promotional.js'

test('prints metadata renders canonical, OG and Twitter from explicitly configured bilingual preview', () => {
  const result = promotionalMetadata({
    kind: 'prints', path: '/prints',
    settings: {
      title_en: 'JBU Fine Art Prints Custom', description_en: 'Custom print description',
      title_es: 'Prints del estudio', image_url: 'https://www.josuebeltranuresti.com/images/prints-og.jpg',
      image_alt: 'Prints artwork', default_language: 'en', image_width: 1200, image_height: 630,
    }, revision: '2026-11-06T14:00:00Z',
  })
  assert.equal(result.title.absolute, 'JBU Fine Art Prints Custom')
  assert.equal(result.description, 'Custom print description')
  assert.equal(result.alternates.canonical, 'https://www.josuebeltranuresti.com/prints')
  assert.equal(result.openGraph.url, result.alternates.canonical)
  assert.equal(result.openGraph.locale, 'en_US')
  assert.equal(result.openGraph.images[0].width, 1200)
  assert.equal(result.openGraph.images[0].height, 630)
  assert.match(result.openGraph.images[0].url, /prints-og.jpg\?v=/)
  assert.equal(result.openGraph.images[0].alt, 'Prints artwork')
  assert.equal(result.twitter.card, 'summary_large_image')
})

test('series resolves slug and localized fallback without inventing descriptions', () => {
  const series = { id: 'some-id', title: 'Époxi', name_es: 'Epoxi', name_en: 'Epoxy', short_description_es: 'Resina', short_description_en: 'Resin' }
  assert.equal(seriesSlug(series), 'epoxi')
  assert.equal(findSeriesBySlug([series], 'epoxi'), series)
  assert.equal(findSeriesBySlug([{ ...series, slug: 'resin-works' }], 'epoxi')?.id, series.id)
  assert.equal(findSeriesBySlug([{ ...series, slug: 'resin-works' }], 'epoxy')?.id, series.id)
  const og = promotionalMetadata({
    kind: 'series', series, path: '/series/epoxi',
    mainImage: 'https://www.josuebeltranuresti.com/images/main.jpg',
    settings: { default_language: 'en' }
  })
  assert.equal(og.title.absolute, 'Epoxy')
  assert.equal(og.description, 'Resin')
  assert.equal(og.openGraph.images[0].url, 'https://www.josuebeltranuresti.com/images/main.jpg')
})

test('fallback image and language are deterministic', () => {
  const og = promotionalMetadata({ kind: 'prints', path: '/prints', settings: {} })
  assert.equal(og.openGraph.locale, 'es_MX')
  assert.equal(og.openGraph.images[0].url, 'https://www.josuebeltranuresti.com/opengraph-image.jpg')
  assert.equal(og.title.absolute, 'JBU — Impresiones artísticas')
  assert.equal(normalizePromoSettings({ default_language: 'pt' }).default_language, 'es')
})

test('unsafe or temporary promotional images are rejected', () => {
  assert.equal(publicImageUrl('http://insecure.example/img.jpg'), '')
  assert.equal(publicImageUrl('https://example.com/img.jpg?token=123'), '')
  assert.equal(publicImageUrl('https://example.com/img.jpg?X-Amz-Signature=abc'), '')
})
