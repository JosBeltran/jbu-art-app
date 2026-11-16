import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveShippingCountries, validateShippingCountries, countryNames, shippingErrorText, SHIPPING_COUNTRY_CODES } from './shippingCountries.js'
import { sessionHasShipping } from './checkoutShipping.server.js'
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
  const actual = resolveShippingCountries(items, name === 'unrestricted cart' ? ['MX','CA','US'] : ['MX','CA','US','GB'])
  assert.deepEqual(actual.countries, expected)
  assert.equal(actual.compatible, expected.length > 0)
})

test('digital items do not require shipping or narrow physical destinations',()=>{
  assert.equal(resolveShippingCountries([{type:'DIGITAL'}],[]).requiresShipping,false)
  assert.deepEqual(resolveShippingCountries([physical(['GB']),{type:'DIGITAL',allowed_shipping_countries:['US']}],['GB']).countries,['GB'])
})
test('session reuse requires identical policy fingerprint and destinations',()=>{
  const shipping={shipping_address_collection:{allowed_countries:['MX']},metadata:{jbu_shipping_fingerprint:'one'}}
  assert.equal(sessionHasShipping(shipping,shipping),true)
  assert.equal(sessionHasShipping({...shipping,metadata:{jbu_shipping_fingerprint:'two'}},shipping),false)
})

test('strict ISO validation rejects malformed lists and preserves null/empty', () => {
  assert.ok(SHIPPING_COUNTRY_CODES.includes('SE'))
  for(const code of ['CU','IR','KP','SY','ZZ','AC','XK']) assert.equal(SHIPPING_COUNTRY_CODES.includes(code),false)
  assert.deepEqual(validateShippingCountries([' gb ','GB','mx']),['GB','MX'])
  assert.equal(validateShippingCountries(null), null)
  assert.deepEqual(validateShippingCountries([]), [])
  for (const value of ['GB', ['UK'], ['ZZ'], [null], [['GB']]])
    assert.throws(() => validateShippingCountries(value), /invalid_shipping_countries/)
})

test('country names and conflict messages are localized', () => {
  assert.equal(countryNames(['GB'], 'en'), 'United Kingdom')
  assert.equal(countryNames(['GB'], 'en-US'), 'United Kingdom')
  assert.equal(countryNames(['GB'], 'es'), 'Reino Unido')
  assert.equal(shippingErrorText('shipping_country_conflict', (es, en) => en), 'The selected products cannot be shipped to the same destination.')
  assert.equal(shippingErrorText('shipping_country_conflict', es => es), 'Los productos seleccionados no pueden enviarse al mismo destino.')
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
