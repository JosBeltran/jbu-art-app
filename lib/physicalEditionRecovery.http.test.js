import { test } from 'node:test'
import assert from 'node:assert/strict'
import { physicalEditionStatus } from './physicalEditionRecovery.http.js'

const art = '00000000-0000-4000-8000-000000000001'
function api() {
  const calls = []
  const hold = { id: 'private-hold', buyer_user_id: 'owner', artwork_id: art, status: 'HELD',
    stripe_session_id: 'private-session', artwork: { id: art, title: 'Edition' }, unit: { status: 'RESERVED' } }
  const db = {
    auth: { async getUser(token) { calls.push(['auth', token]); return token === 'valid' ? { data: { user: { id: 'buyer' } } } : { error: 'invalid' } } },
    from() {
      let rows = [hold]
      return { select() { return this }, order() { return this },
        eq(key, value) { calls.push(['filter', key, value]); rows = rows.filter(row => row[key] === value); return this },
        then(resolve) { resolve({ data: rows }) } }
    },
    async rpc() { throw new Error('must not mutate foreign reservation') },
  }
  const stripe = { checkout: { sessions: { async retrieve() { throw new Error('must not retrieve foreign Stripe session') } } } }
  const run = (path = '', { token = 'valid', cancel = false, body } = {}) => {
    const request = new Request(`https://example.test/api/checkout/physical-edition/status${path}`, {
      method: cancel ? 'POST' : 'GET', headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(cancel ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    })
    return physicalEditionStatus(request, { db, stripe, cancel, bindShipping: async () => {} })
  }
  return { run, calls, hold }
}

for (const token of [null, 'expired', 'forged']) {
  test(`status rejects ${token || 'missing'} authentication before reading reservations`, async () => {
    const f = api()
    const response = await f.run(`?artworkId=${art}`, { token })
    assert.equal(response.status, 401)
    assert.equal(f.calls.some(([name]) => name === 'filter'), false)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  })
}

test('foreign artwork reservation is absent from both artwork and collector responses', async () => {
  const f = api()
  for (const path of ['', `?artworkId=${art}`]) {
    const response = await f.run(path)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { purchases: [] })
    assert.equal(response.headers.get('vary'), 'Authorization')
  }
  assert.equal(f.calls.some(call => call[1] === 'buyer_user_id' && call[2] === 'buyer'), true)
})

test('attacker-supplied hold and Stripe IDs never bypass buyer scope during cancellation', async () => {
  const f = api()
  const response = await f.run('', { cancel: true, body: { artworkId: art,
    holdId: f.hold.id, reservationId: f.hold.id, sessionId: f.hold.stripe_session_id } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { purchases: [] })
  assert.equal(f.calls.some(call => call.includes(f.hold.id) || call.includes(f.hold.stripe_session_id)), false)
})

for (const body of ['{invalid', {}, { artworkId: 'not-a-uuid' }, { sessionId: 'private-session' }]) {
  test(`cancellation rejects invalid selectors ${JSON.stringify(body)}`, async () => {
    const f = api()
    const response = await f.run('', { cancel: true, body })
    assert.equal(response.status, 400)
    assert.equal(f.calls.some(([name]) => name === 'filter'), false)
  })
}

test('owner receives paid purchase projection without private reservation identifiers', async () => {
  const f = api()
  f.hold.status = 'PAID'; f.hold.buyer_user_id = 'buyer'; f.hold.order_id = 'order'
  const response = await f.run(`?artworkId=${art}`)
  const data = await response.json()
  assert.equal(data.purchases[0].state, 'paid')
  assert.equal(data.purchases[0].orderId, 'order')
  const serialized = JSON.stringify(data)
  for (const privateValue of ['private-hold', 'private-session', 'buyer_user_id', 'stripe_create_params']) {
    assert.equal(serialized.includes(privateValue), false)
  }
})
