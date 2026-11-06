import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogQueryHref, catalogFiltersFromQuery } from '../lib/catalogUrl.js'
import { purchasablePrintArtworkIds, isPurchasablePrintVariant } from '../lib/catalogPrintAvailability.js'

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
