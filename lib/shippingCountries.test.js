import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveShippingCountries, validateShippingCountries, countryNames, shippingErrorText, SHIPPING_COUNTRY_CODES } from './shippingCountries.js'
import { checkoutShipping, sessionHasShipping } from './checkoutShipping.server.js'
import { hydratePrintCart } from './guestPrintCart.js'
import { printForm, validatePrintForm } from './printManager.js'

const physical = countries => ({ type: 'PRINT', allowed_shipping_countries: countries })
for (const [name, items, expected] of [
  ['unrestricted cart', [physical(null), physical([])], ['MX', 'CA', 'US']],
  ['UK only', [physical(['GB'])], ['GB']],
  ['UK plus unrestricted original', [physical(['GB']), { type: 'ORIGINAL' }], ['GB']],
  ['two UK products', [physical(['GB']), physical(['GB'])], ['GB']],
  ['incompatible UK and US products', [physical(['GB']), physical(['US'])], []],
  ['multiple countries and one country', [physical(['GB', 'US']), physical(['US'])], ['US']],
]) test(name, () => {
  const actual = resolveShippingCountries(items)
  assert.deepEqual(actual.countries, expected)
  assert.equal(actual.compatible, expected.length > 0)
})

test('digital items do not require shipping or narrow physical destinations', () => {
  assert.deepEqual(checkoutShipping([{ type: 'DIGITAL_DOWNLOAD', allowed_shipping_countries: ['US'] }]), {})
  assert.deepEqual(resolveShippingCountries([physical(['GB']), { type: 'DIGITAL', allowed_shipping_countries: ['US'] }]).countries, ['GB'])
  assert.deepEqual(checkoutShipping([]), {})
})

test('coverage remains separate from restrictions; new destinations fail closed until configured', () => {
  assert.throws(() => checkoutShipping([physical(['GB'])]), /shipping_configuration_unavailable/)
  assert.deepEqual(checkoutShipping([physical(['GB']), { type: 'ORIGINAL' }], 'MX,CA,US,GB'),
    { shipping_address_collection: { allowed_countries: ['GB'] } })
  assert.throws(() => checkoutShipping([physical(['GB']), physical(['US'])], 'GB,US'), /shipping_country_conflict/)
  assert.throws(() => checkoutShipping([physical(['GB', 'US'])], 'GB'), /shipping_configuration_unavailable/)
  for (const bad of ['', 'UK', 'gb', 'GB,GB'])
    assert.throws(() => checkoutShipping([physical(['GB'])], bad), /shipping_configuration_unavailable/)
})

test('existing included shipping remains unchanged and does not introduce a Stripe shipping rate', () => {
  assert.deepEqual(checkoutShipping([physical(null)]), { shipping_address_collection: { allowed_countries: ['MX', 'CA', 'US'] } })
  assert.equal(sessionHasShipping({ shipping_address_collection: { allowed_countries: ['US', 'MX', 'CA'] } }, checkoutShipping([physical(null)])), true)
  assert.equal(sessionHasShipping({ shipping_address_collection: { allowed_countries: ['US', 'MX', 'CA'] } }, checkoutShipping([physical(['GB'])], 'GB')), false)
})

test('strict ISO validation rejects malformed lists and preserves null/empty', () => {
  assert.equal(SHIPPING_COUNTRY_CODES.length, 249)
  assert.equal(validateShippingCountries(null), null)
  assert.deepEqual(validateShippingCountries([]), [])
  for (const value of ['GB', ['gb'], ['UK'], ['ZZ'], ['GB', 'GB'], [null], [['GB']]])
    assert.throws(() => validateShippingCountries(value), /invalid_shipping_countries/)
})

test('country names and conflict messages are localized', () => {
  assert.equal(countryNames(['GB'], 'en'), 'United Kingdom')
  assert.equal(countryNames(['GB'], 'en-US'), 'United Kingdom')
  assert.equal(countryNames(['GB'], 'es'), 'Reino Unido')
  assert.equal(shippingErrorText('shipping_country_conflict', (es, en) => en), 'These products cannot be shipped together. Please purchase them separately.')
  assert.equal(shippingErrorText('shipping_country_conflict', es => es), 'Estos productos no pueden enviarse juntos. Realiza las compras por separado.')
})

test('cart refresh replaces cached restrictions with current variant, independent of original', () => {
  const item = { id: 'a', variantId: 'v', type: 'PRINT', allowed_shipping_countries: ['US'] }
  const variant = { id: 'v', artwork_id: 'a', edition_type: 'OPEN', is_active: true,
    price: 10, allowed_shipping_countries: ['GB'], artwork: { id: 'a', title: 'Art', allowed_shipping_countries: ['MX'] } }
  const [hydrated] = hydratePrintCart([item], [variant], 'OPEN', es => es)
  assert.deepEqual(hydrated.allowed_shipping_countries, ['GB'])
})

test('admin defaults remain null; existing variant restrictions validate and round trip', () => {
  const form = printForm(null, { id: '10000000-0000-4000-8000-000000000001' })
  assert.equal(form.allowed_shipping_countries, null)
  const input = { ...form, id: '20000000-0000-4000-8000-000000000001', create: true, title: 'Stickers', size: 'A6', price: 10, allowed_shipping_countries: ['GB'] }
  assert.deepEqual(validatePrintForm(input).allowed_shipping_countries, ['GB'])
  assert.deepEqual(printForm(input).allowed_shipping_countries, ['GB'])
  assert.throws(() => validatePrintForm({ ...input, allowed_shipping_countries: ['UK'] }), /invalid_shipping_countries/)
})
