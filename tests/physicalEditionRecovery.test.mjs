// node --experimental-vm-modules --test tests/physicalEditionRecovery.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SourceTextModule, SyntheticModule } from 'node:vm'
import * as recovery from '../lib/physicalEditionRecovery.server.js'
import * as crypto from 'node:crypto'

async function cron() {
  const calls = []
  const holds = ['unpaid', 'paid'].map(id => ({ id, artwork_id: `art-${id}`, status: 'HELD', buyer_user_id: `buyer-${id}`,
    stripe_session_id: `cs-${id}`, artwork: { id: `art-${id}` }, unit: { status: 'RESERVED' } }))
  const db = {
    from() {
      let selected = null
      const q = {
        select() { return q }, eq(key, value) { if (key === 'id') selected = holds.find(h => h.id === value); return q },
        lte() { return q }, order(key, options) { calls.push(['order', key, options]); return q },
        async limit(n) { calls.push(['limit', n]); return { data: holds } },
        update(value) { calls.push(['stamp', value]); return q },
        async single() { return { data: selected } },
        then(resolve) { resolve({ data: selected }) },
      }
      return q
    },
    async rpc(name, args) {
      calls.push([name, args])
      holds.find(h => h.id === args._hold).status = 'EXPIRED'
      return { data: true }
    },
  }
  class Stripe {
    checkout = { sessions: { async retrieve(id) {
      const hold = holds.find(h => h.stripe_session_id === id)
      return { id, mode: 'payment', status: hold.id === 'paid' ? 'complete' : 'expired',
        payment_status: hold.id === 'paid' ? 'paid' : 'unpaid', metadata: {
          physical_edition_checkout: 'v1', physical_edition_hold_id: hold.id, user_id: hold.buyer_user_id,
        } }
    } } }
  }
  const deps = {
    'node:crypto': crypto,
    'next/server': { NextResponse: Response },
    stripe: { default: Stripe },
    '@/lib/offersAuth': { serviceClient: () => { calls.push(['db']); return db } },
    '@/lib/checkoutShipping.server': { bindCheckoutShipping: async () => {} },
    '@/lib/physicalEditionRecovery.server': recovery,
  }
  const mod = new SourceTextModule(await readFile(new URL('../app/api/cron/physical-edition-recovery/route.js', import.meta.url), 'utf8'))
  await mod.link(async name => {
    const exports = deps[name]
    assert.ok(exports, name)
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    })
  })
  await mod.evaluate()
  return { calls, holds, post: token => mod.namespace.POST(new Request('https://example.test/api/cron/physical-edition-recovery', {
    method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {},
  })) }
}

test('scheduled recovery requires configured secret, never reads DB for missing or invalid credentials', async () => {
  const previous = process.env.CRON_SECRET
  try {
    const f = await cron()
    delete process.env.CRON_SECRET
    assert.equal((await f.post('anything')).status, 401)
    process.env.CRON_SECRET = 'test-reconciliation-secret'
    assert.equal((await f.post()).status, 401)
    assert.equal((await f.post('wrong')).status, 401)
    assert.equal((await f.post('test-reconciliation-secrex')).status, 401)
    assert.equal(f.calls.length, 0)
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})

test('scheduled recovery verifies each hold, releases only unpaid inventory and rotates the bounded batch', async () => {
  const previous = process.env.CRON_SECRET
  try {
    process.env.CRON_SECRET = 'test-reconciliation-secret'
    const f = await cron()
    const response = await f.post(process.env.CRON_SECRET)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { checked: 2, released: 1, unresolved: 0 })
    assert.equal(f.holds[0].status, 'EXPIRED')
    assert.equal(f.holds[1].status, 'HELD')
    assert.equal(f.calls.filter(([name]) => name === 'expire_physical_edition_checkout_hold').length, 1)
    assert.equal(f.calls.filter(([name]) => name === 'stamp').length, 2)
    assert.deepEqual(f.calls.find(([name]) => name === 'limit'), ['limit', 25])
    assert.deepEqual(f.calls.find(([name]) => name === 'order'), ['order', 'recovery_checked_at', { ascending: true, nullsFirst: true }])
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previous
  }
})
