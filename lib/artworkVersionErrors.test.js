import assert from 'node:assert/strict'
import { test } from 'node:test'
import { artworkVersionDatabaseError } from './artworkVersionErrors.js'

test('version errors distinguish stale provenance, schema, permissions and uniqueness', () => {
  assert.deepEqual(artworkVersionDatabaseError({ message: 'invalid_version_event' }), { status: 400, code: 'invalid_version_event' })
  assert.deepEqual(artworkVersionDatabaseError({ code: 'PGRST202' }), { status: 503, code: 'version_function_missing' })
  assert.deepEqual(artworkVersionDatabaseError({ code: '42501' }), { status: 503, code: 'version_database_permission' })
  assert.deepEqual(artworkVersionDatabaseError({ code: '22001' }), { status: 503, code: 'version_database_constraint' })
  assert.deepEqual(artworkVersionDatabaseError({ code: '23505', message: 'duplicate key value violates unique constraint "artwork_single_successor"' }),
    { status: 409, code: 'successor_exists' })
  assert.deepEqual(artworkVersionDatabaseError({ code: '23505', message: 'duplicate key value violates unique constraint "artworks_sku_key"' }),
    { status: 409, code: 'version_record_conflict' })
})
