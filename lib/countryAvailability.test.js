import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  selectedCountry, matchesCountry, itemAvailableInCountry,
  countryOptionsForItems, countryFilteredPage,
} from './countryAvailability.js'
import { catalogQueryHref, catalogFiltersFromQuery } from './catalogUrl.js'
import { purchasablePrintArtworkIds } from './catalogPrintAvailability.js'
import { resolveShippingCountries } from './shippingCountries.js'
import { checkoutShipping } from './checkoutShipping.server.js'

test('country normalization accepts ISO uppercase codes and rejects unsupported values', () => {
  assert.equal(selectedCountry('SE'), 'SE')
  assert.equal(selectedCountry('GB'), 'GB')
  for (const invalid of [null, undefined, '', 'ALL', 'se', 'UK', 'ZZ', 'US,CA', 'US)'])
    assert.equal(selectedCountry(invalid), null)
})

test('null, empty and one/multiple restrictions', () => {
  for (const item of [
    { allowed_shipping_countries: null },
    { allowed_shipping_countries: [] },
    {},
  ]) {
    assert.equal(itemAvailableInCountry(item, 'SE'), true)
    assert.equal(itemAvailableInCountry(item, 'MX'), true)
  }
  assert.equal(matchesCountry(['SE'], 'SE'), true)
  assert.equal(matchesCountry(['SE'], 'MX'), false)
  assert.equal(matchesCountry(['SE', 'GB'], 'GB'), true)
  assert.equal(matchesCountry(['SE', 'GB'], 'US'), false)
  assert.equal(matchesCountry(['GB'], null), true) // All Countries
})

test('country selection changes result set before counts and pagination', () => {
  const rows = [
    { id: 1, allowed_shipping_countries: ['US'] },
    { id: 2, allowed_shipping_countries: ['SE'] },
    { id: 3, allowed_shipping_countries: null },
    { id: 4, allowed_shipping_countries: [] },
    { id: 5, allowed_shipping_countries: ['SE', 'GB'] },
  ]
  const sweden = countryFilteredPage(rows, 'SE', 1, 2)
  assert.equal(sweden.total, 4)
  assert.deepEqual(sweden.items.map(x => x.id), [2, 3])
  assert.deepEqual(countryFilteredPage(rows, 'SE', 2, 2).items.map(x => x.id), [4, 5])
  assert.deepEqual(countryFilteredPage(rows, 'US', 1, 9).items.map(x => x.id), [1, 3, 4])
  assert.equal(countryFilteredPage(rows, null, 1, 9).total, 5)
})

test('options include defaults and restricted destinations, without duplicate codes', () => {
  const options = countryOptionsForItems([
    { allowed_shipping_countries: ['SE', 'GB'] },
    { allowed_shipping_countries: ['GB'] },
    { allowed_shipping_countries: [] },
  ])
  assert.deepEqual(options, ['CA', 'GB', 'MX', 'SE', 'US'])
})

test('print eligibility is per purchasable variant, not parent original', () => {
  const parents = [
    { id: 'original-a', allows_prints: true, allowed_shipping_countries: ['MX'] },
    { id: 'original-b', allows_prints: true, allowed_shipping_countries: ['SE'] },
  ]
  const variants = [
    { id: 'p1', artwork_id: 'original-a', edition_type: 'OPEN', is_active: true, price: 50, allowed_shipping_countries: ['SE'] },
    { id: 'p2', artwork_id: 'original-a', edition_type: 'OPEN', is_active: true, price: 50, allowed_shipping_countries: ['MX'] },
    { id: 'p3', artwork_id: 'original-b', edition_type: 'OPEN', is_active: false, price: 50, allowed_shipping_countries: ['SE'] },
  ]
  assert.deepEqual([...purchasablePrintArtworkIds(parents, variants, 'SE')], ['original-a'])
  assert.deepEqual([...purchasablePrintArtworkIds(parents, variants, 'MX')], ['original-a'])
  assert.deepEqual([...purchasablePrintArtworkIds(parents, variants, 'US')], [])
  assert.deepEqual([...purchasablePrintArtworkIds(parents, variants, null)], ['original-a'])
  const unavailable = [{ ...variants[0], edition_type: 'LIMITED', max_edition_size: 5, prints_sold: 5 }]
  assert.equal(purchasablePrintArtworkIds(parents, unavailable, 'SE').size, 0)
})

test('URL country changes preserve search, series, sorting and print parameters', () => {
  const href = catalogQueryHref('/catalog', 'series=DECO&prints=true&q=geology&sort=TITLE&status=AVAILABLE', { country: 'SE' })
  const url = new URL(href, 'https://example.test')
  assert.equal(url.searchParams.get('country'), 'SE')
  for (const [key, value] of [['series','DECO'], ['prints','true'], ['q','geology'], ['sort','TITLE'], ['status','AVAILABLE']])
    assert.equal(url.searchParams.get(key), value)
  assert.equal(catalogFiltersFromQuery(url.search, ['DECO']).country, 'SE')
  const cleared = catalogQueryHref('/catalog', url.search, { country: 'ALL' })
  assert.equal(new URL(cleared, 'https://example.test').searchParams.has('country'), false)
  assert.equal(new URL(cleared, 'https://example.test').searchParams.get('prints'), 'true')
})

test('checkout restriction intersection remains authoritative for mixed carts', () => {
  const physical = allowed_shipping_countries => ({ type: 'PRINT', allowed_shipping_countries })
  assert.deepEqual(resolveShippingCountries([physical(['GB']), physical(null)]).countries, ['GB'])
  assert.deepEqual(resolveShippingCountries([physical(['GB']), physical(['GB', 'US'])]).countries, ['GB'])
  assert.equal(resolveShippingCountries([physical(['GB']), physical(['MX'])]).compatible, false)
  assert.deepEqual(resolveShippingCountries([physical(null), physical([])]).countries, ['MX', 'CA', 'US'])
  assert.deepEqual(checkoutShipping([physical(['GB'])], 'MX,CA,US,GB').shipping_address_collection.allowed_countries, ['GB'])
  assert.throws(() => checkoutShipping([physical(['GB'])], 'MX,CA,US'), /shipping_configuration_unavailable/)
  assert.throws(() => checkoutShipping([physical(['GB']), physical(['MX'])], 'MX,GB'), /shipping_country_conflict/)
})
