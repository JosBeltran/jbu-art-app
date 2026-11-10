import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isShareablePrint, printSharePresentation, printShareUrl, printSocialMetadata } from './print.js'

const id = 'e7ea46f2-a585-497f-a529-e6d63c661afc'
const artwork = { title: 'Obra violeta', title_en: 'Violet Artwork', dimensions: '200 × 100 cm' }
const variant = { size: 'A2', price: 450, is_active: true, edition_type: 'OPEN', finish: 'FINE_ART' }

test('print sharing uses the parent localized title and variant specifications', () => {
  const en = printSharePresentation(artwork, { ...variant, paper_type: 'Cotton Rag', framing: 'Black frame' }, 'en-US')
  const es = printSharePresentation(artwork, variant, 'es-MX')
  assert.equal(en.title, 'Violet Artwork | A2 Fine Art Print')
  assert.equal(es.title, 'Obra violeta | Impresión Fine Art A2')
  assert.equal(en.dimensionsLabel, '42 × 59.4 cm (16.54 × 23.39 in)')
  assert.match(en.description, /Cotton Rag · Black frame/)
  assert.doesNotMatch(es.description, /Giclée|EMA|envío|200 × 100/)
  assert.match(printSharePresentation(artwork, { ...variant, size: 'A0', paper_type: 'Papel para Giclée', edition_type: 'LIMITED' }, 'es').description,
    /84.1 × 118.9 cm .*Giclée · Edición limitada/)
})

test('explicit dimensions take precedence over nominal formats and custom sizes are supported', () => {
  assert.equal(printSharePresentation(artwork, { ...variant, size: 'A3 · 280 × 400 mm' }, 'en').dimensionsLabel,
    '28 × 40 cm (11.02 × 15.75 in)')
  assert.equal(printSharePresentation(artwork, { ...variant, size: '13″ × 19″' }, 'en').dimensionsLabel,
    '33.02 × 48.26 cm (13 × 19 in)')
  assert.equal(printSharePresentation(artwork, { ...variant, size: '21,5 x 34 cm' }, 'es').centimeters, '21.5 × 34 cm')
  assert.equal(printSharePresentation(artwork, { ...variant, size: 'Cuadrado' }, 'es').centimeters, '')
})

test('links are stable, active sold-out variants remain shareable and images are absolute HTTPS', () => {
  assert.equal(isShareablePrint({ ...variant, is_available: false }), true)
  assert.equal(isShareablePrint({ ...variant, is_active: false }), false)
  assert.equal(isShareablePrint({ ...variant, price: null }), false)
  const metadata = printSocialMetadata(printSharePresentation(artwork, variant, 'en'), id, 'revision')
  assert.ok(printShareUrl(id).endsWith('/prints/' + id))
  assert.equal(metadata.openGraph.url, printShareUrl(id, 'en'))
  assert.equal(metadata.alternates.canonical, printShareUrl(id))
  assert.match(metadata.openGraph.images[0].url, /^https:\/\//)
  assert.deepEqual([metadata.openGraph.images[0].width, metadata.openGraph.images[0].height], [1200, 630])
  assert.equal(metadata.twitter.images[0].url, metadata.openGraph.images[0].url)
})
