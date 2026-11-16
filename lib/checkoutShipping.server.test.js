import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  prepareCheckoutShipping,
  bindCheckoutShipping,
} from './checkoutShipping.server.js'
import { validateSessionShipping } from './shippingPayment.server.js'
const id = '10000000-0000-4000-8000-000000000001'
const policy = {
  id,
  name: 'Internal',
  name_en: 'Standard shipping',
  name_es: 'Envío estándar',
  method: 'FIXED_RATE',
  countries: [],
  amount_minor: 35000,
  currency: 'MXN',
  minimum_days: 3,
  maximum_days: 7,
  delivery_unit: 'business_day',
  fulfillment_provider: 'ARTIST',
  strategy: 'PER_ITEM',
  active: true,
  postal_codes: [],
}
function fixture({
  globalCountries = ['MX', 'SE'],
  defaults = { original: [id] },
  policies = [policy],
} = {}) {
  const state = { manifest: null }
  const db = {
    async rpc(name, args) {
      if (name === 'prepare_shipping_checkout') {
        state.manifest = {
          id,
          countries: args._countries,
          options: args._options,
          configuration_revision: args._revision,
          fingerprint: args._fingerprint,
        }
        return { data: { id } }
      }
      state.manifest = { ...state.manifest, stripe_session_id: args._session }
      return { data: true }
    },
    from(table) {
      return {
        select() {
          return this
        },
        eq() {
          return this
        },
        is() {
          return this
        },
        order() {
          return Promise.resolve({ data: policies })
        },
        insert(value) {
          state.manifest = { ...value, id }
          return this
        },
        update(value) {
          state.manifest = { ...state.manifest, ...value }
          return this
        },
        single() {
          return Promise.resolve({
            data:
              table === 'site_settings'
                ? {
                    global_shipping_countries: globalCountries,
                    default_shipping_policies: defaults,
                    shipping_revision: 2,
                  }
                : state.manifest,
          })
        },
      }
    },
  }
  return { db, state }
}
test('authoritative preparation produces minor-unit shipping rates, localized names, delivery estimates and session binding', async () => {
  const { db, state } = fixture()
  const params = await prepareCheckoutShipping(
    db,
    [{ id: 'art', type: 'ORIGINAL' }],
    new Request('https://example.test', { headers: { cookie: 'jbu-lang=en' } }),
    {},
    { currency: 'MXN' }
  )
  assert.deepEqual(params.shipping_address_collection.allowed_countries, [
    'MX',
    'SE',
  ])
  const rate = params.shipping_options[0].shipping_rate_data
  assert.equal(rate.display_name, 'Standard shipping')
  assert.equal(rate.fixed_amount.amount, 35000)
  assert.deepEqual(rate.delivery_estimate, {
    minimum: { unit: 'business_day', value: 3 },
    maximum: { unit: 'business_day', value: 7 },
  })
  assert.equal(params.metadata.jbu_shipping_checkout, id)
  await bindCheckoutShipping(db, { id: 'cs_one' }, params)
  assert.equal(state.manifest.stripe_session_id, 'cs_one')
})
test('no physical items produce no address, rate or shipping snapshot', async () => {
  const { db, state } = fixture()
  assert.deepEqual(
    await prepareCheckoutShipping(
      db,
      [{ type: 'DIGITAL' }],
      new Request('https://example.test')
    ),
    {}
  )
  assert.equal(state.manifest, null)
})
test('prepared checkout cannot accept client shipping amount, policy ID or allowed countries', async () => {
  const { db } = fixture()
  const params = await prepareCheckoutShipping(
    db,
    [{ type: 'ORIGINAL', allowed_shipping_countries: ['SE'] }],
    new Request('https://example.test'),
    {
      shippingAmount: 0,
      policyId: 'fake',
      allowedCountries: ['AU'],
      destination: 'SE',
    },
    { currency: 'MXN' }
  )
  assert.deepEqual(params.shipping_address_collection.allowed_countries, ['SE'])
  assert.equal(
    params.shipping_options[0].shipping_rate_data.fixed_amount.amount,
    35000
  )
})
test('verified shipping is subtracted for existing product validation and frozen before fulfillment', async () => {
  const { db, state } = fixture()
  const params = await prepareCheckoutShipping(
    db,
    [{ type: 'ORIGINAL' }],
    new Request('https://example.test'),
    {},
    { currency: 'MXN' }
  )
  await bindCheckoutShipping(db, { id: 'cs_one' }, params)
  const rate = {
    id: 'shr_one',
    metadata: params.shipping_options[0].shipping_rate_data.metadata,
    fixed_amount: { amount: 35000, currency: 'mxn' },
  }
  const session = {
    id: 'cs_one',
    currency: 'mxn',
    amount_total: 135000,
    total_details: { amount_shipping: 35000 },
    metadata: params.metadata,
    shipping_cost: { amount_total: 35000, shipping_rate: 'shr_one' },
    collected_information: { shipping_details: { address: { country: 'SE' } } },
  }
  const stripe = {
    shippingRates: { retrieve: async () => rate },
    checkout: {
      sessions: {
        listLineItems: async () => ({
          data: [{ currency: 'mxn', amount_total: 100000 }],
          has_more: false,
        }),
      },
    },
  }
  const products = await validateSessionShipping(db, stripe, session)
  assert.equal(products.amount_total, 100000)
  assert.equal(session.amount_total, 135000)
  assert.equal(state.manifest.selected_snapshot.amount, 35000)
  await assert.rejects(
    validateSessionShipping(db, stripe, { ...session, amount_total: 135001 }),
    /shipping_order_total_mismatch/
  )
  await assert.rejects(
    validateSessionShipping(db, stripe, { ...session, metadata: {} }),
    /shipping_manifest_missing/
  )
})

test('persistent market restricts server checkout and cannot enable a globally disabled country',async()=>{
 const {db}=fixture()
 const params=await prepareCheckoutShipping(db,[{type:'ORIGINAL'}],new Request('https://example.test',{headers:{cookie:'jbu-market=SE'}}),{}, {currency:'MXN'})
 assert.deepEqual(params.shipping_address_collection.allowed_countries,['SE'])
 await assert.rejects(prepareCheckoutShipping(db,[{type:'ORIGINAL'}],new Request('https://example.test',{headers:{cookie:'jbu-market=GB'}}),{}, {currency:'MXN'}),/shipping_destination_unsupported/)
})
