// Next.js API smoke tests using the local Supabase REST stub.
import assert from 'node:assert/strict'
import sharp from 'sharp'

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


const printId = 'e7ea46f2-a585-497f-a529-e6d63c661afc'
const galleryEndpoint = 'http://127.0.0.1:3100/api/admin/prints'
const putGallery = (body, user = 'admin') => fetch(galleryEndpoint, {
  method: 'PUT',
  headers: {
    ...(user ? { Authorization: 'Bearer fixture-' + user } : {}),
    ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
  },
  body,
})
const upload = buffer => {
  const form = new FormData()
  form.set('id', printId)
  form.set('file', new Blob([buffer], { type: 'image/png' }), 'test.png')
  return form
}
const pixels = await sharp({ create: { width: 10, height: 8, channels: 3, background: '#c0ffee' } }).png().toBuffer()
assert.equal((await putGallery(upload(pixels), null)).status, 401)
assert.equal((await putGallery(upload(pixels), 'collector')).status, 403)
assert.equal((await putGallery(upload('invalid image'))).status, 400)
const uploaded = await putGallery(upload(pixels))
assert.equal(uploaded.status, 200)
const { url } = await uploaded.json()
assert.ok(new URL(url).pathname.includes('/artwork-images/print-galleries/' + printId + '/'))
assert.ok(url.endsWith('.webp'))
const images = [{ url, alt_es: 'Marco', alt_en: 'Frame' }, { url: null, alt_es: '', alt_en: '' }]
const save = (id, revision) => putGallery(JSON.stringify({ id, revision, images }))
assert.equal((await save('e7ea46f2-a585-497f-a529-e6d63c661afd', 0)).status, 400)
const saved = await save(printId, 0)
assert.equal(saved.status, 200)
assert.deepEqual(await saved.json(), { gallery_images: images, gallery_revision: 1 })
assert.equal((await save(printId, 0)).status, 409)
console.log('Gallery authorization, verified image uploads, variant ownership and concurrent edits verified')
