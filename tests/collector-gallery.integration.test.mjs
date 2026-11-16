import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { importGallery } from '../scripts/import-collector-gallery.mjs'
import { GALLERY_BUCKET, mediaPath } from '../lib/collectorGalleryMedia.mjs'

const origin = process.env.GALLERY_TEST_ORIGIN
const admin = process.env.GALLERY_TEST_ADMIN_TOKEN
const collector = process.env.GALLERY_TEST_COLLECTOR_TOKEN
const artwork = process.env.GALLERY_TEST_OWNED_ARTWORK_ID
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

const call = (path, token, options = {}) => fetch(origin + path, {
  ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
})
const patch = (path, token, data) => call(path, token, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
})
const adminPath = '/api/admin/collector-gallery'
const collectorPath = '/api/collection/gallery'
const publicPath = '/api/collector-gallery'

test('collector submission authorization, moderation, private storage and withdrawal', {
  skip: !(origin && admin && collector && artwork && anon && url && key),
}, async () => {
  const original = await sharp({ create: { width: 40, height: 20, channels: 3, background: 'indigo' } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer()
  const form = (link, consent, mime = 'image/jpeg') => {
    const data = new FormData()
    data.set('photo', new Blob([original], { type: mime }), 'sample.jpg')
    data.set('artwork_id', link)
    if (consent) data.set('consent', 'on')
    return data
  }
  const post = (link, consent, mime) => call(collectorPath, collector, { method: 'POST', body: form(link, consent, mime) })
  assert.equal((await call(adminPath)).status, 401)
  assert.equal((await call(adminPath, collector)).status, 403)
  assert.equal((await post(artwork, false)).status, 400)
  assert.equal((await post(randomUUID(), true)).status, 403)
  assert.equal((await post(artwork, true, 'image/png')).status, 400)
  const response = await post(artwork, true)
  assert.equal(response.status, 200)
  const { id } = await response.json()
  const publicImage = publicPath + '?id=' + id
  const db = createClient(url, key)
  try {
    const mine = await (await call(collectorPath, collector)).json()
    assert.equal(mine.entries.find(entry => entry.id === id).status, 'PENDING')
    assert.equal((await call(publicImage)).status, 404)
    assert.equal((await patch(adminPath, admin, { id, action: 'publish' })).status, 409)
    assert.equal((await patch(adminPath, admin, { id, action: 'approve' })).status, 400)
    const authenticated = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${collector}` } } })
    const guest = createClient(url, anon)
    for (const client of [guest, authenticated]) {
      const storage = client.storage.from(GALLERY_BUCKET)
      assert.ok((await storage.download(mediaPath(id, 'full'))).error)
      assert.ok((await storage.upload(mediaPath(randomUUID(), 'full'), original, { contentType: 'image/webp' })).error)
    }
    assert.equal((await patch(adminPath, admin, { id, action: 'approve', rights_confirmed: true })).status, 200)
    assert.equal((await call(publicImage)).status, 404)
    assert.equal((await patch(adminPath, admin, { id, action: 'publish' })).status, 200)
    const listing = await (await call(publicPath)).json()
    const shown = listing.find(entry => entry.id === id)
    assert.ok(shown)
    assert.equal('submitter_id' in shown, false)
    assert.equal('artwork_id' in shown, false)
    const visible = await call(publicImage)
    assert.equal(visible.status, 200)
    assert.match(visible.headers.get('cache-control'), /no-store/)
    const meta = await sharp(Buffer.from(await visible.arrayBuffer())).metadata()
    assert.deepEqual([meta.width, meta.height], [20, 40])
    assert.equal(meta.exif, undefined)
    assert.equal((await post(artwork, false)).status, 400, 'the fifth attempt still reaches validation')
    assert.equal((await post(artwork, true)).status, 429)
    assert.equal((await patch(collectorPath, collector, { id })).status, 200)
    assert.equal((await call(publicImage)).status, 404)
    assert.equal((await patch(adminPath, admin, { id, action: 'publish' })).status, 409)
    const audit = await db.from('collector_gallery_audit').select('status').eq('entry_id', id).order('id')
    assert.ifError(audit.error)
    assert.deepEqual(audit.data.map(row => row.status), ['PENDING', 'APPROVED', 'APPROVED', 'WITHDRAWN'])
  } finally {
    assert.equal((await patch(adminPath, admin, { id, action: 'remove' })).status, 200)
    assert.ok((await db.storage.from(GALLERY_BUCKET).download(mediaPath(id, 'full'))).error)
  }
})

test('import preserves legacy originals and remains idempotent', {
  skip: !(origin && url && key && process.env.GALLERY_TEST_LEGACY_IMPORT === '1'),
}, async () => {
  const db = createClient(url, key, { auth: { persistSession: false } })
  const first = await importGallery(db)
  const second = await importGallery(db, () => assert.fail('rerun should not fetch originals'))
  assert.equal(first.imported + first.skipped, 4)
  assert.deepEqual(second, { imported: 0, skipped: 4 })
  const rows = await db.from('collector_gallery_entries').select('id,status,visible').eq('source', 'LEGACY')
  assert.ifError(rows.error)
  assert.equal(rows.data.length, 4)
  for (const row of rows.data) {
    assert.equal(row.status, 'DRAFT')
    assert.equal(row.visible, false)
    const original = await db.storage.from(GALLERY_BUCKET).download(mediaPath(row.id, 'original'))
    assert.ifError(original.error)
    assert.equal((await sharp(Buffer.from(await original.data.arrayBuffer())).metadata()).format, 'jpeg')
  }
})
