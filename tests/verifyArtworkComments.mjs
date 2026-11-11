import assert from 'node:assert/strict'

const site = 'http://127.0.0.1:3100'
const artwork = 'e7ea46f2-a585-497f-a529-e6d63c661afb'
const query = '/api/artwork-comments?artwork=' + artwork + '&context=artwork'
const request = (path, user, body) => fetch(site + path, {
  method: body ? 'POST' : 'GET',
  headers: { ...(user ? { Authorization: 'Bearer fixture-' + user } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
})

const anon = await request(query)
assert.equal(anon.status, 200)
assert.match(anon.headers.get('cache-control'), /no-store/)
const publicRead = await anon.json()
assert.deepEqual(publicRead.comments.map(row => row.moderation_status), ['APPROVED'])
assert.doesNotMatch(JSON.stringify(publicRead), /Private pending|author_user_id|@example/)
const own = await (await request(query, 'commenter')).json()
assert.equal(own.comments.find(row => row.moderation_status === 'PENDING')?.mine, true)

const submit = { action: 'submit', artwork, context: 'artwork', body: 'Question from a new Google account',
  _studio: true, author_user_id: 'fake', moderation_status: 'APPROVED' }
assert.equal((await request('/api/artwork-comments', null, submit)).status, 401)
const posted = await request('/api/artwork-comments', 'commenter', submit)
assert.equal(posted.status, 200)
assert.equal((await posted.json()).status, 'PENDING')
assert.equal((await request('/api/admin/comments', 'commenter')).status, 403)
assert.equal((await request('/api/admin/comments', 'admin')).status, 200)
const page = await (await request('/artwork/ver-history-fixture')).text()
assert.doesNotMatch(page, /code\.tidio|tidio-chat/)
console.log('Artwork comment public/author projections, Google identity, role enforcement and Tidio removal verified')
