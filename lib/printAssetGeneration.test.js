import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { generateArtworkPrintAssets, previewArtworkPrintAssets, printAssetOptions, printStagingPath } from './printAssetGeneration.server.js'
import { printLayoutPolicy } from './printAssetLayout.js'
import { renderPrintAsset } from './printAssetRender.server.js'
import { PRINT_MASTER_BUCKET } from './printAssetPresets.js'
import { publicPrintOptions } from './publicPrintCollection.js'
import { publicCollectionNavigation } from './publicNavigation.js'
import { hydratePrintCart } from './guestPrintCart.js'

const artwork = { id: '10000000-0000-0000-0000-000000000001', title: 'Ink study', sku: 'ink-study', primary_image_url: '/assets/original.jpg', availability_status: 'SOLD' }
const admin = '20000000-0000-0000-0000-000000000001'
const requestId = '30000000-0000-0000-0000-000000000001'
const config = { supabaseUrl: 'https://project.supabase.co', siteUrl: 'https://jbu.example' }

function fixture(input, { failPreview = false, sqlError = null } = {}) {
  const calls = []
  let generation
  const db = {
    from(table) {
      let requestLookup = false
      const q = {
        select: () => q, order: () => q, in: () => q,
        eq(key) { if (key === 'request_id') requestLookup = true; return q },
        then(resolve) { return Promise.resolve({ data: table === 'print_asset_generations' && requestLookup && generation ? [generation] : [] }).then(resolve) },
      }
      return q
    },
    storage: { from(bucket) {
      return {
        upload: async (path, body) => {
          calls.push(['upload', bucket, path, body.length])
          return bucket === 'artworks' && failPreview ? { error: { code: 'fixture' } } : {}
        },
        download: async path => { calls.push(['download', bucket, path]); return { data: new Blob([input]) } },
        remove: async paths => { calls.push(['remove', bucket, ...paths]); return {} },
        getPublicUrl: path => ({ data: { publicUrl: 'https://example.test/' + path } }),
      }
    } },
    rpc: async (name, payload) => {
      calls.push(['rpc', name, payload])
      if (sqlError) return { error: sqlError }
      generation = {
        print_id: payload._new_print, artwork_id: artwork.id, generated_by: admin, size: payload._size,
        preview_image_url: payload._preview, effective_dpi: payload._dpi, layout: payload._layout, production_file_path: payload._master,
        production_status: payload._master ? 'MASTER_READY' : 'PREVIEW_ONLY',
      }
      return { data: generation }
    },
  }
  return { db, calls }
}

const makeInput = (width, height) => sharp({ create: { width, height, channels: 3, background: '#9852c3' } }).png().toBuffer()
const policy = printLayoutPolicy({})
const options = (overrides = {}) => printAssetOptions({
  requestId, master: true, sizes: ['A2'], edition: 'OPEN', source: 'primary', replace: false, ...overrides,
}, policy)
const approve = async (db, plan, fetchSource) => ({
  ...plan, ...(await previewArtworkPrintAssets(db, artwork, admin, plan, config, policy, { fetchSource })),
  allowInterpolation: true, acceptLowDpi: true,
})
const render = async () => ({ master: Buffer.from('master'), preview: Buffer.from('preview') })

test('A2 uses the artwork primary source, persists separate artifacts, and a retried request does not generate again', async () => {
  const input = await makeInput(4900, 6500)
  const { db, calls } = fixture(input)
  const fetchSource = async (url, settings) => {
    assert.equal(url.href, 'https://jbu.example/assets/original.jpg')
    assert.equal(settings.redirect, 'error')
    return new Response(input)
  }
  const approved = await approve(db, options(), fetchSource)
  const [result] = await generateArtworkPrintAssets(db, artwork, admin, approved, config, { fetchSource, render, policy })
  assert.equal(result.ok, true)
  assert.equal(result.size, 'A2')
  assert.match(result.preview, /print-previews\/.+\/preview\.webp$/)
  assert.equal(calls[0][1], PRINT_MASTER_BUCKET)
  assert.equal(calls[1][1], 'artworks')
  assert.equal(calls[2][2]._price, null)
  assert.equal(calls[2][2]._source.kind, 'primary')
  assert.deepEqual(await generateArtworkPrintAssets(db, artwork, admin, options(), config, {
    fetchSource: () => { throw new Error('unexpected fetch') }, render,
  }), [result])
  assert.equal(calls.length, 3)
})

test('A1 uses the scoped staged upload and removes it after saving', async () => {
  const input = await makeInput(8400, 6400)
  const { db, calls } = fixture(input)
  const approved = await approve(db, options({ sizes: ['A1'], source: 'upload' }))
  const [result] = await generateArtworkPrintAssets(db, artwork, admin, approved, config, {
    policy,
    render: async (buffer, geometry) => {
      const assets = await renderPrintAsset(buffer, geometry)
      const master = await sharp(assets.master).metadata()
      assert.deepEqual([master.width, master.height, master.density], [9933, 7016, 300])
      assert.equal((await sharp(assets.preview).metadata()).width, 808)
      assert.deepEqual(assets.preview, Buffer.from(approved.previews[0].image.split(',')[1], 'base64'))
      return assets
    },
  })
  const staging = printStagingPath(artwork.id, admin, requestId)
  assert.deepEqual(calls[0], ['download', PRINT_MASTER_BUCKET, staging])
  assert.deepEqual(calls.at(-1), ['remove', PRINT_MASTER_BUCKET, staging])
  assert.equal(result.ok, true)
  assert.equal(calls.find(call => call[0] === 'rpc')[2]._source.kind, 'upload')
})

test('rejects untrusted sources, and cleans attempted outputs after storage or confirmed SQL failure', async () => {
  const input = await makeInput(4900, 6200)
  const { db } = fixture(input)
  await assert.rejects(generateArtworkPrintAssets(db, { ...artwork, primary_image_url: 'https://wrong.example/file.jpg' },
    admin, options(), config, { fetchSource: () => assert.fail('unexpected external fetch') }), { code: 'unsupported_source_location' })
  for (const failure of [{ failPreview: true }, { sqlError: { code: '23514' } }]) {
    const instance = fixture(input, failure)
    const fetchSource = async () => new Response(input)
    const approved = await approve(instance.db, options(), fetchSource)
    const [result] = await generateArtworkPrintAssets(instance.db, artwork, admin, approved, config, { fetchSource, render, policy })
    assert.equal(result.ok, false)
    assert.deepEqual(instance.calls.filter(call => call[0] === 'remove').map(call => call[1]), [PRINT_MASTER_BUCKET, 'artworks'])
  }
})

test('public collection has separate variant links, uses safe preview fields and retains cart image', () => {
  const variants = ['A1', 'A2'].map((size, index) => ({
    id: requestId.slice(0, -1) + index, artwork_id: artwork.id, size, edition_type: 'OPEN', price: 1500, is_active: true,
    resolved_print_image_url: '/preview-' + size + '.webp', production_file_path: '/secret/master.jpg', artwork,
  }))
  const cards = publicPrintOptions([artwork], { [artwork.id]: {
    variants: [...variants, { ...variants[0], id: 'draft', is_active: false }], gallery: [],
  } })
  assert.equal(cards.length, 2)
  assert.equal(cards[0].image, '/preview-A1.webp')
  assert.ok(cards[1].href.endsWith('?print=' + variants[1].id + '#prints'))
  assert.doesNotMatch(JSON.stringify(cards), /secret|master\.jpg/)
  assert.equal(hydratePrintCart([{ id: artwork.id, variantId: variants[0].id, quantity: 1 }], variants, 'OPEN', (es) => es)[0].image,
    '/preview-A1.webp')
  assert.deepEqual(publicCollectionNavigation((es) => es).map(item => item.href), ['/catalog', '/prints', '/about'])
})


test('replacing a limited edition does not require entering its original edition size', () => {
  const target = '40000000-0000-0000-0000-000000000001'
  assert.equal(options({ edition: 'LIMITED', targets: { A2: target }, replace: true }).limit, null)
  assert.throws(() => options({ edition: 'LIMITED' }), { code: 'invalid_options' })
})


test('generation checks a current preview, low DPI and interpolation before writing any assets', async () => {
  const input = await makeInput(2630, 3700)
  const { db, calls } = fixture(input)
  const fetchSource = async () => new Response(input)
  const context = { fetchSource, render, policy }
  const plan = options({ mode: 'coverage' })
  const run = overrides => generateArtworkPrintAssets(db, artwork, admin, { ...plan, ...overrides }, config, context)
  const { previewKey } = await previewArtworkPrintAssets(db, artwork, admin, plan, config, policy, { fetchSource })
  assert.equal(calls.length, 0)
  await assert.rejects(run({}), { code: 'preview_changed' })
  await assert.rejects(run({ previewKey }), { code: 'quality_confirmation_required' })
  await assert.rejects(run({ previewKey, acceptLowDpi: true }), { code: 'interpolation_confirmation_required' })
  assert.equal(calls.length, 0)
  const [saved] = await run({ previewKey, acceptLowDpi: true, allowInterpolation: true })
  assert.equal(saved.ok, true)
  const payload = calls.find(call => call[0] === 'rpc')[2]
  assert.equal(Math.round(payload._layout.effectiveDpi), 167)
  assert.ok(payload._layout.marginsMm.left >= 10)
})

test('A2 and A1 preview-only creation for a historical artwork does not render or store a master', async () => {
  const input = await makeInput(2200, 2850)
  const historical = { ...artwork, is_historical_version: true }
  const fetchSource = async () => new Response(input)
  for (const size of ['A2', 'A1']) {
    const { db, calls } = fixture(input)
    const plan = printAssetOptions({ requestId, sizes: [size], edition: 'OPEN', source: 'primary', replace: false }, policy)
    assert.equal(plan.master, false)
    const { previewKey } = await previewArtworkPrintAssets(db, historical, admin, plan, config, policy, { fetchSource })
    const [result] = await generateArtworkPrintAssets(db, historical, admin, { ...plan, previewKey, allowInterpolation: true },
      config, { fetchSource, policy, render: () => assert.fail('production rendering is disabled') })
    assert.equal(result.productionStatus, 'PREVIEW_ONLY')
    assert.deepEqual(calls.filter(call => call[0] === 'upload').map(call => call[1]), ['artworks'])
    const payload = calls.find(call => call[0] === 'rpc')[2]
    assert.equal(payload._master, null)
    assert.equal(payload._layout.size, size)
    assert.equal(payload._layout.algorithmVersion, 1)
    assert.equal(payload._layout.normalizedPlacement.width, payload._layout.artworkWidth / payload._layout.width)
    assert.equal(payload._layout.minimumEffectiveDpi, 240)
  }
})
