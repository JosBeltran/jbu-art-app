import assert from 'node:assert/strict'
import test from 'node:test'
import { digitalAdminEnabled, digitalCheckoutEnabled, digitalSandboxKey, fulfillDigitalCheckout } from './commerce.js'

const purchase = '460b0499-bbb2-4cb6-bc27-284ae2628000'
const event = (type, fields = {}) => ({
  type,
  data: { object: {
    id: 'cs_test_1', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid',
    payment_intent: 'pi_1', currency: 'mxn', amount_total: 25000,
    metadata: { digital_art_download: 'v1', digital_purchase_id: purchase },
    ...fields,
  } },
})

test('feature flags require explicit opt-in and checkout only accepts sandbox keys', (t) => {
  const env = { ...process.env }
  t.after(() => {
    for (const key of ['ENABLE_DIGITAL_DOWNLOADS_ADMIN', 'ENABLE_DIGITAL_DOWNLOADS_CHECKOUT']) {
      if (env[key] === undefined) delete process.env[key]
      else process.env[key] = env[key]
    }
  })
  delete process.env.ENABLE_DIGITAL_DOWNLOADS_ADMIN
  delete process.env.ENABLE_DIGITAL_DOWNLOADS_CHECKOUT
  assert.equal(digitalAdminEnabled(), false)
  assert.equal(digitalCheckoutEnabled(), false)
  process.env.ENABLE_DIGITAL_DOWNLOADS_ADMIN = 'true'
  assert.equal(digitalAdminEnabled(), true)
  assert.equal(digitalCheckoutEnabled(), false)
  process.env.ENABLE_DIGITAL_DOWNLOADS_CHECKOUT = 'true'
  assert.equal(digitalCheckoutEnabled(), true)
  assert.equal(digitalSandboxKey('sk_test_example'), true)
  assert.equal(digitalSandboxKey('rk_test_example'), true)
  assert.equal(digitalSandboxKey(undefined), false)
  assert.equal(digitalSandboxKey('sk_live_example'), false)
})

test('only paid, completed sandbox sessions reach fulfillment, including delayed payments', async () => {
  const expected = {
    _purchase: purchase, _session: 'cs_test_1', _intent: 'pi_1', _currency: 'MXN', _amount: 25000,
  }
  let calls = 0
  const db = { rpc: async (name, args) => {
    calls++
    assert.equal(name, 'fulfill_digital_art_purchase')
    assert.deepEqual(args, expected)
    return { data: true }
  } }
  assert.deepEqual(await fulfillDigitalCheckout(event('checkout.session.completed', { payment_status: 'unpaid' }), db),
    { received: true, unpaid: true })
  assert.deepEqual(await fulfillDigitalCheckout(event('checkout.session.async_payment_failed'), db), { received: true })
  await assert.rejects(fulfillDigitalCheckout(event('checkout.session.completed', { livemode: true }), db))
  await assert.rejects(fulfillDigitalCheckout(event('checkout.session.completed', { amount_total: 0 }), db))
  await assert.rejects(fulfillDigitalCheckout(event('checkout.session.completed', { status: 'open' }), db))
  assert.equal(calls, 0)
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_succeeded']) {
    assert.deepEqual(await fulfillDigitalCheckout(event(type), db), { received: true, digital: true })
  }
  assert.equal(calls, 2)
  await assert.rejects(fulfillDigitalCheckout(event('checkout.session.completed'), { rpc: async () => ({ data: false }) }))
})
