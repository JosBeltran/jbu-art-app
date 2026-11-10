import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { assessMasterSource, deferredPrintMaster, regenerateApprovedPrintPreview } from './deferredPrintMaster.server.js'
import { printAssetGeometry } from './printAssetLayout.js'
import { renderPrintPreview } from './printAssetRender.server.js'

const config = { supabaseUrl: 'https://project.supabase.co', siteUrl: 'https://jbu.example' }
const artwork = { id: '10000000-0000-0000-0000-000000000001', primary_image_url: '/assets/source.png' }
const admin = '20000000-0000-0000-0000-000000000001'
const revision = '30000000-0000-0000-0000-000000000001'
const source = (width, height, shifted = false) => sharp(Buffer.from(
  `<svg width="${width}" height="${height}" viewBox="0 0 100 150">
    <rect width="100" height="150" fill="#cfb78a"/>
    <rect x="${shifted ? 60 : 10}" y="10" width="30" height="120" fill="#300957"/>
   </svg>`,
)).png().toBuffer()
const layout = {
  ...printAssetGeometry('A2', { mode: 'quality', outputDpi: 150, borderMm: 10 }, { width: 360, height: 540 }),
  algorithmVersion: 1, fitStrategy: 'contain', crop: null, sourceAspectRatio: 2 / 3, minimumEffectiveDpi: 240,
}
const previewPath = 'print-previews/' + artwork.id + '/a2/first/preview.webp'

async function fixture({ failUpload = false, higher = true } = {}) {
  const original = await source(360, 540)
  const selected = higher ? await source(720, 1080) : original
  const preview = await renderPrintPreview(original, layout)
  const row = {
    revision_id: revision, artwork_id: artwork.id, production_status: 'MASTER_PENDING', layout,
    preview_image_url: config.supabaseUrl + '/storage/v1/object/public/artworks/' + previewPath,
    source_image_ref: { kind: 'primary', url: artwork.primary_image_url, sha256: createHash('sha256').update(original).digest('hex') },
  }
  const calls = []
  const db = {
    rpc: async (name, args) => { calls.push([name, args]); return { data: true } },
    storage: { from(bucket) { return {
      upload: async (path, content, options) => {
        calls.push(['upload', bucket, path, content, options])
        return failUpload ? { error: { code: 'test_upload_failed' } } : {}
      },
      remove: async paths => { calls.push(['remove', bucket, paths]); return {} },
    } } },
  }
  const fetchSource = async url => new Response(url.pathname.endsWith('preview.webp') ? preview : selected)
  const renderMaster = async (buffer, geometry) => {
    assert.deepEqual(buffer, selected)
    assert.deepEqual(geometry, row.layout)
    return Buffer.from('private-master')
  }
  return { db, row, calls, fetchSource, renderMaster, preview }
}

test('replacement source assessment accepts higher resolution and detects aspect, quality and framing differences', async () => {
  const original = await source(360, 540)
  const approved = await renderPrintPreview(original, layout)
  const up = await assessMasterSource(layout, await source(720, 1080), approved, false)
  assert.deepEqual(up.errors, [])
  assert.ok(up.effectiveDpi >= 480)
  assert.ok((await assessMasterSource(layout, await source(720, 960), approved, false)).errors.includes('aspect_mismatch'))
  assert.ok((await assessMasterSource(layout, await source(180, 270), approved, false)).errors.includes('insufficient_resolution'))
  assert.ok((await assessMasterSource(layout, await source(720, 1080, true), approved, false)).errors.includes('framing_mismatch'))
  assert.deepEqual(await sharp(up.image).metadata().then(({ width, height }) => [width, height]),
    await sharp(approved).metadata().then(({ width, height }) => [width, height]))
})

test('deferred master uses the purchased geometry and stores only a private master after confirmation', async () => {
  const f = await fixture()
  const run = options => deferredPrintMaster(f.db, artwork, f.row, admin, { source: 'saved', ...options }, config, f)
  const proposal = await run({})
  assert.deepEqual(proposal.errors, [])
  assert.deepEqual(f.calls, [])
  await assert.rejects(run({ generate: true, key: proposal.key }), { code: 'preview_changed' })
  const { production } = await run({ generate: true, key: proposal.key, confirm: true })
  assert.equal(production.status, 'MASTER_READY')
  assert.doesNotMatch(JSON.stringify(production), /master\.jpg/)
  assert.deepEqual(f.calls.map(call => call[0]), ['claim_print_master', 'upload', 'complete_print_master'])
  assert.equal(f.calls[1][1], 'print-masters')
  assert.equal(f.calls[2][1]._revision, revision)
  assert.equal(f.calls[2][1]._path, f.calls[1][2])
})

test('a failed deferred upload leaves the order revision retryable and records failure', async () => {
  const f = await fixture({ failUpload: true })
  const run = options => deferredPrintMaster(f.db, artwork, f.row, admin, { source: 'saved', ...options }, config, f)
  const { key } = await run({})
  await assert.rejects(run({ generate: true, key, confirm: true }), { code: 'storage_failed' })
  assert.deepEqual(f.calls.map(call => call[0]), ['claim_print_master', 'upload', 'remove', 'complete_print_master'])
  assert.equal(f.calls.at(-1)[1]._path, null)
  assert.equal(f.calls.at(-1)[1]._error, 'storage_failed')
})

test('preview regeneration requires original bytes and recreates the same public preview only', async () => {
  const changed = await fixture()
  await assert.rejects(regenerateApprovedPrintPreview(changed.db, artwork, changed.row, admin, { source: 'saved' }, config,
    changed), { code: 'original_source_required' })
  assert.deepEqual(changed.calls, [])
  const f = await fixture({ higher: false })
  assert.deepEqual(await regenerateApprovedPrintPreview(f.db, artwork, f.row, admin, { source: 'saved' }, config, f),
    { regenerated: true })
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][1], 'artworks')
  assert.equal(f.calls[0][2], previewPath)
  assert.deepEqual(f.calls[0][3], f.preview)
})
