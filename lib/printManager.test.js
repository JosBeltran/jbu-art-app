import { test } from 'node:test'
import assert from 'node:assert/strict'
import { printForm, nextPrintForm, validatePrintForm, printImageFields } from './printManager.js'
import { collectorPrintCartKey, hydratePrintCart, selectPrintRows } from './guestPrintCart.js'
import { hasPrintQuantity, purchasablePrintArtworkIds } from './catalogPrintAvailability.js'
import { resolvePrintImage } from './printImages.js'

const artwork = { id: '10000000-0000-0000-0000-000000000001', title: 'Obra', primary_image_url: '/original.webp', allows_prints: true }
const id = '20000000-0000-0000-0000-000000000001'
const request = { ...printForm(null, artwork), id, create: true, title: 'Edición sobre papel',
  title_en: 'Edition on paper', description: 'Papel de algodón', description_en: 'Cotton paper',
  sku: 'P-A3', size: 'A3', price: '1200.25', is_active: true }

test('create open and limited variants for an existing parent, retaining bilingual commercial text', () => {
  const open = validatePrintForm({ ...request, max_edition_size: 20 })
  assert.equal(open.artwork_id, artwork.id)
  assert.equal(open.price, 1200.25)
  assert.equal(open.description, 'Papel de algodón')
  assert.equal(open.description_en, 'Cotton paper')
  assert.equal(open.max_edition_size, null)
  assert.equal(validatePrintForm({ ...request, edition_type: 'LIMITED', max_edition_size: 20 }).max_edition_size, 20)
  assert.equal(validatePrintForm({ ...request, description_en: 'Revised' }).description_en, 'Revised')
})

test('save and add another and duplicate keep reusable attributes only', () => {
  const original = { ...request, prints_sold: 9, image_key: 'primary', image_url: '/original.webp', max_edition_size: 20 }
  for (const duplicate of [false, true]) {
    const next = nextPrintForm(original, duplicate)
    assert.equal(next.artwork_id, artwork.id)
    assert.equal(next.size, 'A3')
    assert.equal(next.title, duplicate ? original.title : '')
    assert.equal(next.image_key, duplicate ? 'primary' : '')
    assert.equal(next.sku, '')
    assert.equal(next.price, '')
    assert.equal(next.max_edition_size, '')
    assert.equal(next.is_active, false)
    assert.equal(next.id, undefined)
    assert.equal(next.prints_sold, undefined)
  }
})

test('validation rejects invalid parent, prices, currencies, edition counts and empty titles', () => {
  for (const [change, code] of [
    [{ artwork_id: 'new-artwork' }, /invalid_print/],
    [{ price: 0 }, /invalid_print_price/], [{ price: '10.001' }, /invalid_print_price/],
    [{ currency: 'USD' }, /invalid_print_currency/],
    [{ edition_type: 'LIMITED', max_edition_size: 0 }, /invalid_print_edition_size/],
    [{ title: ' ' }, /required_print_fields/],
  ]) assert.throws(() => validatePrintForm({ ...request, ...change }), code)
})

test('image sources are exclusive, and external uploads are rejected', () => {
  const origin = 'https://project.supabase.co'
  assert.equal(printImageFields('primary', '', artwork, origin).image_url, '/original.webp')
  assert.equal(printImageFields('gallery:' + id, '', artwork, origin).print_gallery_image_id, id)
  assert.equal(printImageFields('provenance:' + id, '', artwork, origin).print_provenance_image_id, id)
  const uploaded = origin + '/storage/v1/object/public/artworks/artwork-images/prints/photo.webp'
  assert.equal(printImageFields('upload', uploaded, artwork, origin).image_url, uploaded)
  assert.throws(() => printImageFields('upload', 'https://example.org/photo.webp', artwork, origin), /invalid_print_image/)
})

test('active variants remain discoverable for sold originals and respect display order', () => {
  const sold = { ...artwork, availability_status: 'SOLD' }
  const open = { ...validatePrintForm(request), resolved_print_image_url: '/print.webp', sort_order: 1 }
  const inactive = { ...open, is_active: false }
  assert.deepEqual([...purchasablePrintArtworkIds([sold], [open])], [sold.id])
  assert.deepEqual([...purchasablePrintArtworkIds([sold], [inactive])], [])
  assert.equal(resolvePrintImage({ artwork: sold, context: 'prints', variants: [
    { ...open, id: 'later', resolved_print_image_url: '/other.webp', sort_order: 2 }, open,
  ] }), '/print.webp')
})

test('cart refresh keeps exact variant details, while the guest route only accepts OPEN', () => {
  const item = { id: artwork.id, variantId: id, quantity: 2, type: 'PRINT' }
  const open = { ...validatePrintForm(request), artwork, resolved_print_image_url: '/print.webp' }
  const limited = { ...open, edition_type: 'LIMITED', max_edition_size: 10, prints_sold: 9 }
  const translate = (_es, en) => en
  assert.deepEqual(hydratePrintCart([item], [limited], 'OPEN', translate), [])
  assert.deepEqual(hydratePrintCart([item], [limited], 'LIMITED', translate), [{
    ...item, sku: undefined, title: 'Edition on paper · A3 · FINE_ART', price: 1200.25, size: 'A3',
    finish: 'FINE_ART', edition_type: 'LIMITED', image: '/print.webp', primary_image_url: '/original.webp',
  }])
  assert.notEqual(collectorPrintCartKey('alice'), collectorPrintCartKey('bob'))
  assert.throws(() => selectPrintRows([limited], [item]), /not_open_edition/)
  assert.equal(selectPrintRows([open], [{ ...item, price: 1 }])[0].priceMxn, 1200.25)
  assert.equal(hasPrintQuantity(limited, 1), true)
  assert.equal(hasPrintQuantity(limited, 2), false)
})
