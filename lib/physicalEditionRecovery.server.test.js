import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buyerPhysicalHolds, reconcilePhysicalHold } from './physicalEditionRecovery.server.js'

const now = Date.parse('2026-11-16T12:00:00Z')
function fixture(overrides = {}) {
  const hold = { id: 'hold', artwork_id: 'art', buyer_user_id: 'buyer', status: 'HELD',
    created_at: new Date(now - 120000).toISOString(),
    stripe_session_id: 'cs_original', expires_at: new Date(now + 35 * 60000).toISOString(),
    artwork: { id: 'art', title: 'Natural wood edition', primary_image_url: 'https://example.test/art.jpg' },
    unit: { status: 'RESERVED', unit_identifier: 'CANVAS-003', edition_number: 3 }, ...overrides }
  let session = { id: 'cs_original', mode: 'payment', status: 'open', payment_status: 'unpaid',
    expires_at: (now + 31 * 60000) / 1000, url: 'https://checkout.stripe.com/original',
    currency: 'usd', shipping_address_collection: { allowed_countries: ['US'] },
    metadata: { physical_edition_checkout: 'v1', physical_edition_hold_id: hold.id, user_id: hold.buyer_user_id } }
  let persisted = { status: hold.status, order_id: hold.order_id }
  const calls = []
  const db = {
    async rpc(name, args) {
      calls.push([name, args])
      if (name === 'expire_physical_edition_checkout_hold' && persisted.status === 'HELD') {
        persisted = { status: 'EXPIRED' }; return { data: true }
      }
      if (name === 'cancel_unbound_physical_edition_hold') { persisted = { status: 'CANCELLED' }; return { data: true } }
      return { data: false }
    },
    from(table) {
      calls.push(['from', table])
      return { select() { return this }, eq() { return this }, async single() { return { data: persisted } } }
    },
  }
  const stripe = {
    checkout: { sessions: {
      async retrieve(id) { calls.push(['retrieve', id]); return structuredClone(session) },
      async expire(id) { calls.push(['expire', id]); session.status = 'expired'; session.url = null; return session },
      async *list(params) { calls.push(['list', params]) },
      async create(params, options) { calls.push(['create', params, options]); return session },
    } },
    paymentIntents: {
      async cancel(id) { calls.push(['cancelIntent', id]); session.payment_intent = { id, status: 'canceled' } },
      async retrieve(id) { calls.push(['retrieveIntent', id]); return session.payment_intent },
    },
  }
  const run = extra => reconcilePhysicalHold({ db, stripe, buyer: 'buyer', hold, now,
    bindShipping: async (...args) => { calls.push(['bindShipping', args[2]]) }, ...extra })
  return { hold, stripe, db, calls, run, get session() { return session },
    setPersisted(value) { persisted = value } }
}
const releases = f => f.calls.filter(([name]) => name === 'expire_physical_edition_checkout_hold')

test('refresh and return resume original checkout without allocating, repricing or changing destination', async () => {
  const f = fixture()
  const first = await f.run()
  const reopened = await f.run()
  assert.equal(first.state, 'open')
  assert.equal(first.resumeUrl, f.session.url)
  assert.equal(reopened.resumeUrl, first.resumeUrl)
  assert.equal(first.unit.unit_identifier, 'CANVAS-003')
  assert.equal(first.expiresAt, new Date(f.session.expires_at * 1000).toISOString())
  assert.deepEqual(f.calls.map(([name]) => name), ['retrieve', 'retrieve'])
  assert.equal(f.session.currency, 'usd')
  assert.deepEqual(f.session.shipping_address_collection.allowed_countries, ['US'])
  assert.equal(JSON.stringify(first).includes('buyer_user_id'), false)
  assert.equal(JSON.stringify(first).includes('stripe_session_id'), false)
})

test('explicit cancellation verifies expiration then releases once; retries remain idempotent', async () => {
  const f = fixture()
  const cancelled = await f.run({ cancel: true })
  assert.equal(cancelled.canStartNew, true)
  assert.equal(cancelled.resumeUrl, null)
  assert.deepEqual(f.calls.slice(0, 4).map(([name]) => name), ['retrieve', 'expire', 'retrieve', 'expire_physical_edition_checkout_hold'])
  const retry = await f.run({ hold: { ...f.hold, status: 'EXPIRED' }, cancel: true })
  assert.equal(retry.canStartNew, true)
  assert.equal(releases(f).length, 1)
})

for (const state of ['processing', 'succeeded', 'requires_action', 'unknown']) {
  test(`expired checkout with ${state} intent never releases inventory`, async () => {
    const f = fixture()
    f.session.status = 'expired'
    f.session.payment_intent = { id: 'pi', status: state }
    const result = await f.run({ cancel: true })
    assert.equal(result.canStartNew, false)
    assert.equal(result.resumeUrl, null)
    assert.equal(releases(f).length, 0)
  })
}

test('expired unpaid session reconciles without any webhook and permits a new key', async () => {
  const f = fixture({ expires_at: new Date(now - 60000).toISOString() })
  f.session.status = 'expired'
  f.session.expires_at = now / 1000 - 60
  const result = await f.run()
  assert.equal(result.state, 'expired')
  assert.equal(result.canStartNew, true)
  assert.equal(releases(f).length, 1)
})

test('elapsed database or Stripe deadline alone cannot release an open checkout', async () => {
  const f = fixture({ expires_at: new Date(now - 60000).toISOString() })
  f.session.expires_at = now / 1000 - 60
  const result = await f.run()
  assert.equal(result.canStartNew, false)
  assert.equal(releases(f).length, 0)
})

test('unconfirmed intent is cancelled and authoritatively reread before release', async () => {
  const f = fixture()
  f.session.status = 'expired'
  f.session.payment_intent = { id: 'pi', status: 'requires_payment_method' }
  assert.equal((await f.run()).canStartNew, true)
  assert.deepEqual(f.calls.slice(0, 4).map(([name]) => name), ['retrieve', 'cancelIntent', 'retrieveIntent', 'expire_physical_edition_checkout_hold'])
})

for (const status of ['complete', 'expired']) {
  test(`${status} paid session is retained pending webhook fulfillment`, async () => {
    const f = fixture()
    f.session.status = status
    f.session.payment_status = 'paid'
    const result = await f.run({ cancel: true })
    assert.equal(result.state, 'paid_pending_fulfillment')
    assert.equal(result.canStartNew, false)
    assert.equal(releases(f).length, 0)
    assert.equal(f.calls.some(([name]) => name === 'expire'), false)
  })
}

test('complete unpaid asynchronous payment remains held', async () => {
  const f = fixture()
  f.session.status = 'complete'
  assert.equal((await f.run({ cancel: true })).state, 'processing')
  assert.equal(releases(f).length, 0)
})

test('completion wins cancellation race, even when expire throws', async () => {
  const f = fixture()
  f.stripe.checkout.sessions.expire = async () => {
    f.session.status = 'complete'; f.session.payment_status = 'paid'
    throw new Error('session_not_open')
  }
  assert.equal((await f.run({ cancel: true })).state, 'paid_pending_fulfillment')
  assert.equal(releases(f).length, 0)
})

test('successful expire call is not proof: still-open readback does not release', async () => {
  const f = fixture()
  f.stripe.checkout.sessions.expire = async () => ({ status: 'expired' })
  assert.equal((await f.run({ cancel: true })).state, 'open')
  assert.equal(releases(f).length, 0)
})

test('webhook fulfillment winning the DB lock is read back as paid, never as released', async () => {
  const f = fixture()
  f.session.status = 'expired'
  f.setPersisted({ status: 'PAID', order_id: 'order' })
  const result = await f.run()
  assert.equal(result.state, 'paid')
  assert.equal(result.orderId, 'order')
  assert.equal(result.canStartNew, false)
})

test('another account cannot retrieve or cancel a known hold', async () => {
  const f = fixture()
  await assert.rejects(f.run({ buyer: 'attacker', cancel: true }), /edition_forbidden/)
  assert.equal(f.calls.length, 0)
})

for (const field of ['user_id', 'physical_edition_hold_id', 'physical_edition_checkout']) {
  test(`Stripe ${field} mismatch blocks resume and cancellation`, async () => {
    const f = fixture()
    f.session.metadata[field] = 'foreign'
    await assert.rejects(f.run({ cancel: true }), /edition_session_verification_failed/)
    assert.equal(releases(f).length, 0)
    assert.equal(f.calls.some(([name]) => name === 'expire'), false)
  })
}

test('unknown legacy unbound hold remains reserved; never equate missing binding with no payment', async () => {
  const f = fixture({ stripe_session_id: null, expires_at: new Date(now - 3600000).toISOString() })
  const result = await f.run({ cancel: true })
  assert.equal(result.state, 'unresolved')
  assert.equal(result.canStartNew, false)
  assert.deepEqual(f.calls.map(([name]) => name), ['list'])
})

test('creation-fenced READY hold can be safely cancelled without calling Stripe', async () => {
  const f = fixture({ stripe_session_id: null, creation_state: 'READY' })
  assert.equal((await f.run()).state, 'preparing')
  assert.equal((await f.run({ cancel: true })).canStartNew, true)
  assert.deepEqual(f.calls.map(([name]) => name), ['cancel_unbound_physical_edition_hold'])
})

test('lost Stripe response recovers same request and unit using durable original parameters', async () => {
  const params = { currency: 'usd', metadata: { jbu_shipping_checkout: 'original-quote' } }
  const f = fixture({ stripe_session_id: null, creation_state: 'STARTED', stripe_create_params: params,
    stripe_creation_started_at: new Date(now - 60000).toISOString() })
  const result = await f.run()
  assert.equal(result.resumeUrl, f.session.url)
  assert.deepEqual(f.calls[0], ['create', params, { idempotencyKey: 'jbu-physical-edition-hold' }])
  assert.deepEqual(f.calls[1], ['bind_physical_edition_checkout_session', { _hold: 'hold', _session: 'cs_original' }])
  assert.deepEqual(f.calls[2], ['bindShipping', params])
  assert.equal(releases(f).length, 0)
})

test('never replay an ambiguous creation request beyond Stripe idempotency retention', async () => {
  const f = fixture({ stripe_session_id: null, creation_state: 'STARTED', stripe_create_params: {},
    stripe_creation_started_at: new Date(now - 24 * 3600000).toISOString() })
  assert.equal((await f.run({ cancel: true })).state, 'unresolved')
  assert.deepEqual(f.calls.map(([name]) => name), ['list'])
})

test('Stripe outage cannot release a held unit', async () => {
  const f = fixture()
  f.stripe.checkout.sessions.retrieve = async () => { throw new Error('network') }
  await assert.rejects(f.run({ cancel: true }), /network/)
  assert.equal(releases(f).length, 0)
})

test('query scopes service-role reads to buyer and artwork, preferring active holds', async () => {
  const filters = []
  const data = [{ id: 'old', status: 'PAID' }, { id: 'active', status: 'HELD' }]
  const query = { select() { return this }, eq(...args) { filters.push(args); return this },
    order() { return this }, then(resolve) { resolve({ data }) } }
  const rows = await buyerPhysicalHolds({ from: () => query }, 'buyer', 'art')
  assert.deepEqual(filters, [['buyer_user_id', 'buyer'], ['artwork_id', 'art']])
  assert.equal(rows[0].id, 'active')
})


test('legacy unbound session can be positively discovered, bound and expired without replaying creation', async () => {
  const f = fixture({ stripe_session_id: null })
  f.session.status = 'expired'
  f.stripe.checkout.sessions.list = async function *() {
    yield { id: 'foreign', mode: 'payment', metadata: { user_id: 'other', physical_edition_hold_id: f.hold.id } }
    yield f.session
  }
  const result = await f.run()
  assert.equal(result.canStartNew, true)
  assert.equal(result.state, 'expired')
  assert.equal(f.calls.some(([name]) => name === 'create'), false)
  assert.equal(releases(f).length, 1)
})

test('old ambiguous request discovers a paid session without replaying its expired idempotency key', async () => {
  const f = fixture({ stripe_session_id: null, stripe_create_params: {},
    stripe_creation_started_at: new Date(now - 25 * 3600000).toISOString() })
  f.session.status = 'complete'; f.session.payment_status = 'paid'
  f.stripe.checkout.sessions.list = async function *() { yield f.session }
  assert.equal((await f.run({ cancel: true })).state, 'paid_pending_fulfillment')
  assert.equal(f.calls.some(([name]) => name === 'create'), false)
  assert.equal(releases(f).length, 0)
})

test('lost shipping binding is repaired using the original session metadata before resume', async () => {
  const f = fixture()
  f.session.metadata.jbu_shipping_checkout = 'original-quote'
  await f.run()
  assert.deepEqual(f.calls.map(([name]) => name), ['retrieve', 'bindShipping'])
  assert.equal(f.calls[1][1].metadata.jbu_shipping_checkout, 'original-quote')
})

test('failed creation replay and empty discovery never imply a safe release', async () => {
  const f = fixture({ stripe_session_id: null, stripe_create_params: {},
    stripe_creation_started_at: new Date(now - 3600000).toISOString() })
  f.stripe.checkout.sessions.create = async () => { throw new Error('StripeInvalidRequestError') }
  assert.equal((await f.run()).state, 'unresolved')
  assert.equal(releases(f).length, 0)
})
