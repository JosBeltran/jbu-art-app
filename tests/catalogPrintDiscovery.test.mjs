import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogQueryHref, catalogFiltersFromQuery } from '../lib/catalogUrl.js'
import { purchasablePrintArtworkIds, isPurchasablePrintVariant, hasPrintQuantity } from '../lib/catalogPrintAvailability.js'
import { publicPrintOptions } from '../lib/publicPrintCollection.js'
import { hydratePrintCart, selectPrintRows } from '../lib/guestPrintCart.js'

test('direct prints URL activates filter and series is retained', () => {
  assert.deepEqual(catalogFiltersFromQuery('prints=true', ['Epoxi']), { series: 'ALL', prints: true })
  assert.deepEqual(catalogFiltersFromQuery('series=Epoxi&prints=true', ['Epoxi']), { series: 'Epoxi', prints: true })
})

test('toggling print availability preserves unrelated URL parameters and series', () => {
  const url = catalogQueryHref('/catalog', 'series=Epoxi&sort=TITLE&page=2&prints=true', { prints: false })
  assert.equal(url, '/catalog?series=Epoxi&sort=TITLE&page=2')
  assert.equal(catalogQueryHref('/catalog', 'sort=TITLE', { prints: true }), '/catalog?sort=TITLE&prints=true')
  assert.equal(catalogQueryHref('/catalog', 'series=Epoxi&prints=true&sort=TITLE', { series: 'ALL', prints: false }), '/catalog?sort=TITLE')
  assert.equal(catalogQueryHref('/catalog', 'prints=true', { series: 'Epoxi' }), '/catalog?prints=true&series=Epoxi')
})

test('only enabled available positive-price variants count', () => {
  const valid = { artwork_id: 'a', is_active: true, is_available: true, edition_type: 'OPEN', price: 100 }
  assert.equal(isPurchasablePrintVariant(valid), true)
  assert.equal(isPurchasablePrintVariant({ ...valid, is_active: false }), false)
  assert.equal(isPurchasablePrintVariant({ ...valid, is_available: false }), false)
  assert.equal(isPurchasablePrintVariant({ ...valid, price: 0 }), false)
  assert.equal(isPurchasablePrintVariant({ ...valid, edition_type: 'LIMITED', edition_size: 5, prints_sold: 5 }), false)
  const found = purchasablePrintArtworkIds([
    { id: 'a', allows_prints: true, status: 'OWNED' },
    { id: 'b', allows_prints: false },
  ], [valid, { ...valid, artwork_id: 'b' }])
  assert.deepEqual([...found], ['a'])
})

test('historical print cards link to their own SKU and exact variant with the generated preview', () => {
  const art = { id: 'older', sku: 'ver-history', title: 'Earlier version', primary_image_url: '/original.webp' }
  const open = { id: 'open', artwork_id: art.id, title: 'A2 Fine Art', size: 'A2', edition_type: 'OPEN', is_active: true,
    price: 1400, resolved_print_image_url: '/generated-preview.webp' }
  const limited = { ...open, id: 'limited', size: 'A1', edition_type: 'LIMITED', max_edition_size: 3, prints_sold: 2 }
  const media = { [art.id]: { gallery: [], variants: [
    open, limited, { ...open, id: 'inactive', is_active: false }, { ...limited, id: 'sold-out', prints_sold: 3 },
  ] } }
  const options = publicPrintOptions([art], media)
  assert.deepEqual(options.map(({ href, edition, image, size, price }) => ({ href, edition, image, size, price })), [
    { href: '/artwork/ver-history?print=open#prints', edition: 'OPEN', image: '/generated-preview.webp', size: 'A2', price: 1400 },
    { href: '/artwork/ver-history?print=limited#prints', edition: 'LIMITED', image: '/generated-preview.webp', size: 'A1', price: 1400 },
  ])

  const cart = { id: art.id, variantId: open.id, price: 1, quantity: 2, type: 'PRINT' }
  const [checkout] = selectPrintRows([open, limited], [cart])
  assert.equal(checkout.artwork_id, art.id)
  assert.equal(checkout.id, open.id)
  assert.equal(checkout.priceMxn, open.price)
  assert.throws(() => selectPrintRows([open], [{ ...cart, id: 'current' }]), /invalid_print_variant/)
  assert.throws(() => selectPrintRows([limited], [{ ...cart, variantId: limited.id }]), /not_open_edition/)
  const [collector] = hydratePrintCart([{ ...cart, variantId: limited.id }], [{ ...limited, artwork: art }], 'LIMITED', es => es)
  assert.equal(collector.id, art.id)
  assert.equal(collector.variantId, limited.id)
  assert.equal(collector.image, '/generated-preview.webp')
  assert.equal(collector.sku, art.sku)
  assert.equal(hasPrintQuantity(limited, 1), true)
  assert.equal(hasPrintQuantity(limited, 2), false)
})
