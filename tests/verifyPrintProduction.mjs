// Next.js API smoke tests using the local Supabase REST stub.
import assert from 'node:assert/strict'

const endpoint = 'http://127.0.0.1:3100/api/admin/print-production'
const item = 'e7ea46f2-a585-497f-a529-e6d63c661aff'
const get = (query = '', user) => fetch(endpoint + query, {
  headers: user ? { Authorization: 'Bearer fixture-' + user } : {},
})

assert.equal((await get()).status, 401)
assert.equal((await get('', 'collector')).status, 403)

const queue = await get('', 'admin')
assert.equal(queue.status, 200)
assert.deepEqual((await queue.json()).queue.map(row => row.item_id), [item])

const detail = await get('?item=' + item, 'admin')
assert.equal(detail.status, 200)
const body = await detail.json()
assert.equal(body.preparation.snapshot.layout.size, 'A2')
assert.equal(body.preparation.state, 'AWAITING_APPROVAL')
assert.equal(body.production.hasMaster, true)
assert.doesNotMatch(JSON.stringify(body), /private\/master\.jpg/)
assert.equal((await get('?item=' + item + '&download', 'admin')).status, 409)
console.log('Admin production queue, purchased layout, role checks and download approval verified')
