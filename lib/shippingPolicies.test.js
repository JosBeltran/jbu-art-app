import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveCartShipping,
  validateShippingPolicy,
  validateShippingDefaults,
  itemPolicyIds,
} from './shippingPolicies.js'
import { resolveEffectiveCountries } from './shippingCountries.js'
import { validateShippingPayment } from './shippingPayment.js'
const id = '10000000-0000-4000-8000-000000000001',
  second = '10000000-0000-4000-8000-000000000002'
const policy = (changes = {}) => ({
  id,
  name: 'Standard',
  name_en: 'Standard shipping',
  name_es: 'Envío estándar',
  method: 'INCLUDED',
  countries: [],
  amount_minor: 0,
  currency: 'MXN',
  minimum_days: 5,
  maximum_days: 10,
  delivery_unit: 'business_day',
  fulfillment_provider: 'ARTIST',
  strategy: 'PER_ITEM',
  insurance_required: false,
  active: true,
  postal_codes: [],
  instructions_en: '',
  instructions_es: '',
  notes: 'Private',
  ...changes,
})
const print = (changes = {}) => ({
  id: 'print',
  type: 'PRINT',
  edition_type: 'OPEN',
  quantity: 1,
  allowed_shipping_countries: null,
  ...changes,
})
const resolve = (changes = {}) =>
  resolveCartShipping({
    items: [print()],
    globalCountries: ['MX', 'US', 'GB', 'SE'],
    defaults: { open_print: [id], original: [id] },
    policies: [policy()],
    locale: 'en',
    ...changes,
  })
test('null/empty inherit, normalize/deduplicate, preserve explicit disabled restrictions', () => {
  assert.deepEqual(
    resolveEffectiveCountries({
      globalCountries: [' mx ', 'SE', 'MX'],
      variantCountries: [],
    }),
    ['MX', 'SE']
  )
  assert.deepEqual(
    resolveEffectiveCountries({
      globalCountries: ['MX', 'SE'],
      artworkCountries: ['SE', 'GB'],
      variantCountries: ['SE'],
      supplierCountries: ['US'],
    }),
    []
  )
  const restricted = { allowed_shipping_countries: ['GB'] }
  assert.deepEqual(
    resolve({ items: [print(restricted)], globalCountries: ['GB'] }).countries,
    ['GB']
  )
  assert.throws(
    () => resolve({ items: [print(restricted)], globalCountries: ['MX'] }),
    /shipping_country_conflict/
  )
  assert.deepEqual(restricted.allowed_shipping_countries, ['GB'])
})
test('enabling Sweden automatically applies to existing original and print, disabling removes it', () => {
  const items = [print(), { id: 'art', type: 'ORIGINAL' }]
  assert.deepEqual(
    resolve({ items, globalCountries: ['MX', 'SE'] }).countries,
    ['MX', 'SE']
  )
  assert.deepEqual(resolve({ items, globalCountries: ['MX'] }).countries, [
    'MX',
  ])
  assert.throws(
    () => resolve({ items, globalCountries: [] }),
    /shipping_country_conflict/
  )
})
test('explicit variant, parent and category precedence; missing or inactive policies never become free', () => {
  assert.deepEqual(
    itemPolicyIds(
      print({
        shipping_policy_ids: [second],
        artwork: { shipping_policy_ids: [id] },
      }),
      { open_print: [id] }
    ),
    [second]
  )
  assert.deepEqual(
    itemPolicyIds(print({ artwork: { shipping_policy_ids: [second] } }), {
      open_print: [id],
    }),
    [second]
  )
  assert.throws(
    () => resolve({ defaults: {} }),
    /shipping_configuration_unavailable/
  )
  assert.throws(
    () => resolve({ policies: [policy({ active: false })] }),
    /shipping_configuration_unavailable/
  )
  assert.equal(
    resolve({
      items: [print({ shipping_policy_ids: [second] })],
      policies: [
        policy(),
        policy({ id: second, method: 'FIXED_RATE', amount_minor: 30000 }),
      ],
    }).options[0].amount,
    30000
  )
  assert.equal(
    resolve({
      defaults: { open_print: [second] },
      policies: [
        policy(),
        policy({ id: second, method: 'FIXED_RATE', amount_minor: 20000 }),
      ],
    }).options[0].amount,
    20000
  )
})
test('same options use all countries; differing country rates demand destination and enforce it', () => {
  const policies = [
      policy({ countries: ['MX'] }),
      policy({
        id: second,
        countries: ['US', 'SE'],
        method: 'FIXED_RATE',
        amount_minor: 35000,
      }),
    ],
    defaults = { open_print: [id, second] }
  const standard = resolve()
  assert.equal(standard.options[0].amount, 0)
  assert.equal(standard.countries.length, 4)
  assert.equal(standard.options[0].maximumDays, 10)
  assert.throws(
    () => resolve({ policies, defaults }),
    (error) =>
      error.message === 'shipping_destination_required' &&
      error.countries.includes('SE')
  )
  const selected = resolve({ policies, defaults, destination: 'SE' })
  assert.deepEqual(selected.countries, ['SE'])
  assert.equal(selected.options[0].amount, 35000)
  assert.throws(
    () => resolve({ destination: 'AU' }),
    /shipping_destination_unsupported/
  )
  assert.equal(
    resolve({ policies, defaults, destination: 'MX' }).options[0].amount,
    0
  )
})
test('multiple quantities and providers do not undercharge; per-order grouping must be explicit', () => {
  const items = [print({ quantity: 2 }), print({ id: 'other', quantity: 3 })]
  assert.equal(
    resolve({
      items,
      policies: [policy({ method: 'FIXED_RATE', amount_minor: 10000 })],
    }).options[0].amount,
    50000
  )
  assert.equal(
    resolve({
      items,
      policies: [
        policy({
          method: 'FIXED_RATE',
          amount_minor: 10000,
          strategy: 'PER_ORDER',
        }),
      ],
    }).options[0].amount,
    10000
  )
  const mixed = [print(), print({ id: 'other', shipping_policy_ids: [second] })]
  const result = resolve({
    items: mixed,
    policies: [
      policy(),
      policy({
        id: second,
        fulfillment_provider: 'PRODIGI',
        method: 'FIXED_RATE',
        amount_minor: 9000,
      }),
    ],
  })
  assert.equal(result.options[0].amount, 9000)
  assert.equal(result.options[0].groups.length, 2)
  assert.equal(result.options[0].groups[0].policy.notes, undefined)
})
test('digital-only requires neither destinations nor policies; mixed ignores digital shipping restrictions', () => {
  assert.deepEqual(
    resolve({
      items: [{ type: 'DIGITAL' }],
      globalCountries: [],
      defaults: {},
      policies: [],
    }),
    { countries: [], options: [] }
  )
  assert.deepEqual(
    resolve({
      items: [print(), { type: 'DIGITAL', allowed_shipping_countries: ['AU'] }],
    }).countries,
    ['MX', 'US', 'GB', 'SE']
  )
})
test('local pickup, delivery, buyer arrangements and quote-required are explicit and fail safely', () => {
  for (const method of ['LOCAL_PICKUP', 'LOCAL_DELIVERY', 'BUYER_ARRANGED'])
    assert.equal(
      resolve({ policies: [policy({ method })] }).options[0].method,
      method
    )
  assert.throws(
    () => resolve({ policies: [policy({ method: 'QUOTE_REQUIRED' })] }),
    /shipping_quote_required/
  )
  assert.throws(
    () =>
      resolve({
        policies: [
          policy({ method: 'LOCAL_DELIVERY', postal_codes: ['64000'] }),
        ],
      }),
    /shipping_postal_code_required/
  )
  assert.throws(
    () =>
      resolve({
        items: [print(), print({ shipping_policy_ids: [second] })],
        policies: [policy(), policy({ id: second, method: 'LOCAL_PICKUP' })],
      }),
    /shipping_method_conflict/
  )
  // Quote approval reuses an explicit, administrator-assigned valid policy.
  assert.equal(
    resolve({
      items: [print({ shipping_policy_ids: [second] })],
      policies: [
        policy({ method: 'QUOTE_REQUIRED' }),
        policy({ id: second, method: 'FIXED_RATE', amount_minor: 120000 }),
      ],
    }).options[0].amount,
    120000
  )
})
test('USD shipping uses existing conversion rules and localized customer name', () => {
  const result = resolve({
    policies: [policy({ method: 'FIXED_RATE', amount_minor: 35000 })],
    charge: { currency: 'USD', usdPerMxn: 0.05 },
    locale: 'es',
  })
  assert.equal(result.options[0].amount, 1800)
  assert.equal(result.options[0].currency, 'usd')
  assert.equal(result.options[0].displayName, 'Envío estándar')
})
test('policy input validates currency, units, estimates, prices and supported countries', () => {
  assert.equal(validateShippingPolicy(policy()).method, 'INCLUDED')
  for (const bad of [
    { amount_minor: -1 },
    { amount_minor: 0.5 },
    { method: 'INCLUDED', amount_minor: 100 },
    { minimum_days: 11, maximum_days: 5 },
    { minimum_days: null },
    { currency: 'EUR' },
    { countries: ['CU'] },
    { strategy: 'CHEAPEST' },
  ])
    assert.throws(() => validateShippingPolicy(policy(bad)))
  assert.throws(() => validateShippingDefaults({ unknown: [id] }))
})
const manifest = () => ({
  id,
  stripe_session_id: 'cs_paid',
  countries: ['SE'],
  options: resolve().options,
})
const rate = () => ({
  id: 'shr_one',
  metadata: { jbu_shipping_checkout: id, jbu_shipping_option: '0' },
  fixed_amount: { amount: 0, currency: 'mxn' },
})
const session = () => ({
  id: 'cs_paid',
  currency: 'mxn',
  metadata: { jbu_shipping_checkout: id },
  total_details: { amount_shipping: 0 },
  shipping_cost: { amount_total: 0, shipping_rate: 'shr_one' },
  collected_information: {
    shipping_details: { address: { country: 'SE', postal_code: '12345' } },
  },
})
test('signed shipping choice captures a frozen snapshot and rejects currency/rate/destination/amount tampering', () => {
  const snapshot = validateShippingPayment(session(), manifest(), rate())
  assert.equal(snapshot.country, 'SE')
  assert.equal(snapshot.stripe_shipping_rate, 'shr_one')
  for (const bad of [
    { currency: 'usd' },
    { id: 'cs_other' },
    { total_details: { amount_shipping: 50 } },
    {
      collected_information: {
        shipping_details: { address: { country: 'AU' } },
      },
    },
  ])
    assert.throws(() =>
      validateShippingPayment({ ...session(), ...bad }, manifest(), rate())
    )
  assert.throws(() =>
    validateShippingPayment(session(), manifest(), {
      ...rate(),
      metadata: { jbu_shipping_checkout: second, jbu_shipping_option: '0' },
    })
  )
  assert.throws(() =>
    validateShippingPayment(session(), manifest(), {
      ...rate(),
      fixed_amount: { amount: 99, currency: 'mxn' },
    })
  )
})
