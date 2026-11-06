import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMediaInventory, collectMediaInventory, normalizeMediaUrl } from './mediaInventory.js'

function fixture(overrides = {}) {
  return {
    artworks: [{ id: 'a', sku: 'A', primary_image_url: 'https://x.supabase.co/storage/v1/object/public/artworks/img/a.jpg' }],
    artworkImages: [{ id: '1', artwork_id: 'a', image_url: 'https://x.supabase.co/storage/v1/object/public/artworks/img/a.jpg?v=12', media_type: 'image' }],
    provenanceImages: [{ id: '2', artwork_id: 'a', image_url: 'https://x.supabase.co/storage/v1/object/public/artworks/old.jpg', visibility: 'ADMIN_ONLY' }],
    provenanceEvents: [{ id: '3', artwork_id: 'a', primary_image_url: 'https://x.supabase.co/storage/v1/object/public/artworks/old.jpg#image', visibility: 'PRIVATE' }],
    ...overrides,
  }
}

function fakeDb(data, { failTable = null, maxRows = Infinity } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      return {
        select() {
          return {
            order(field) {
              assert.equal(field, 'id')
              return {
                async range(start, end) {
                  calls.push({ table, start, end })
                  if (table === failTable) return { data: null, error: { code: '42501', message: 'permission denied' } }
                  const rows = [...(data[table] || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))
                  return { data: rows.slice(start, Math.min(end + 1, start + maxRows)), error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

test('normalizes query strings and URL hash without changing the original storage key', () => {
  assert.equal(normalizeMediaUrl('https://X.SUPABASE.co/storage/path/A%20B.jpg?v=2#x'),
    'https://x.supabase.co/storage/path/A%20B.jpg')
})

test('deduplicates physical URLs while preserving artwork and provenance source references', () => {
  const inventory = buildMediaInventory(fixture())
  assert.equal(inventory.artworks, 1)
  assert.equal(inventory.jobs.length, 2)
  assert.equal(inventory.references, 4)
  assert.equal(inventory.duplicates, 2)
  assert.deepEqual(inventory.counts, { artworkPrimary: 1, artworkGallery: 1, provenanceImages: 1, provenancePrimary: 1 })
  assert.equal(inventory.jobs.find((j) => j.url.endsWith('/old.jpg')).references.length, 2)
})

test('per-source counts are unique even when the same URL is referenced twice', () => {
  const f = fixture()
  f.provenanceImages.push({ id: '5', artwork_id: 'a', image_url: f.provenanceImages[0].image_url + '?dup=1' })
  const inventory = buildMediaInventory(f)
  assert.equal(inventory.counts.provenanceImages, 1)
  assert.equal(inventory.references, 5)
  assert.equal(inventory.duplicates, 3)
  assert.equal(inventory.jobs.length, 2)
})

test('retains relationships when the same URL is reused by different artworks', () => {
  const base = fixture({ artworks: [{ id: 'a' }, { id: 'b' }], artworkImages: [], provenanceEvents: [] })
  base.provenanceImages.push({ id: '4', artwork_id: 'b', image_url: base.provenanceImages[0].image_url })
  const inventory = buildMediaInventory(base)
  assert.equal(inventory.jobs.length, 1)
  assert.deepEqual(inventory.jobs[0].references.map((r) => r.artwork_id), ['a', 'b'])
})

test('paginates every source and includes private and administrative events', async () => {
  const f = fixture()
  f.artworks.push({ id: 'b', primary_image_url: null }, { id: 'c', primary_image_url: null })
  const db = fakeDb({
    artworks: f.artworks, artwork_images: f.artworkImages,
    provenance_event_images: f.provenanceImages, provenance_events: f.provenanceEvents,
  })
  const inventory = await collectMediaInventory(db, { pageSize: 2 })
  assert.equal(inventory.artworks, 3)
  assert.equal(inventory.counts.provenanceImages, 1)
  assert.equal(inventory.counts.provenancePrimary, 1)
  assert.deepEqual(db.calls.filter((r) => r.table === 'artworks').map((r) => r.start), [0, 2])
  assert.ok(db.calls.some((r) => r.table === 'provenance_events'))
})

test('fails the entire audit when any table cannot be read', async () => {
  const f = fixture()
  for (const failTable of ['artworks', 'artwork_images', 'provenance_event_images', 'provenance_events']) {
    const db = fakeDb({
      artworks: f.artworks, artwork_images: f.artworkImages,
      provenance_event_images: f.provenanceImages, provenance_events: f.provenanceEvents,
    }, { failTable })
    await assert.rejects(() => collectMediaInventory(db, { pageSize: 2 }),
      (error) => error.message.includes(failTable) && error.message.includes('permission denied'))
  }
})
