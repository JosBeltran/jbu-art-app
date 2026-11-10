import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { inspectPrintSource, printAssetGeometry, renderPrintAsset } from './printAssetRender.server.js'

test('A2 production JPEG keeps the whole image, white paper and 300 DPI, and the preview is a separate small WebP', async () => {
  const input = await sharp({ create: { width: 4900, height: 5100, channels: 3, background: '#1369c2' } }).png().toBuffer()
  const geometry = printAssetGeometry('A2', 'margin', await inspectPrintSource(input))
  assert.equal(geometry.width, 4961)
  assert.equal(geometry.height, 7016)
  assert.ok(geometry.left >= 118 && geometry.top > 118)
  const { master, preview } = await renderPrintAsset(input, geometry)
  const metadata = await sharp(master).metadata()
  assert.equal(metadata.format, 'jpeg')
  assert.equal(metadata.width, 4961)
  assert.equal(metadata.height, 7016)
  assert.equal(metadata.density, 300)
  assert.ok(metadata.hasProfile)
  const previewInfo = await sharp(preview).metadata()
  assert.equal(previewInfo.format, 'webp')
  assert.equal(previewInfo.height, 808)
  assert.ok(preview.length < 100_000)
  const pixel = async (left, top) => [...await sharp(preview).extract({ left, top, width: 1, height: 1 }).raw().toBuffer()]
  assert.ok((await pixel(10, 10)).every(value => Math.abs(value - 232) <= 5))
  assert.ok((await pixel(48, 48)).every(value => value >= 245))
  assert.ok((await pixel(250, 350))[2] > 170)
})

test('A1 honors landscape orientation, with an explicit effective DPI threshold', async () => {
  const geometry = printAssetGeometry('A1', 'fit', { width: 10000, height: 6400 })
  assert.equal(geometry.width, 9933)
  assert.equal(geometry.height, 7016)
  assert.equal(geometry.left, 0)
  assert.ok(geometry.top > 0)
  assert.throws(() => printAssetGeometry('A1', 'margin', { width: 1000, height: 700 }), { code: 'insufficient_resolution' })
  await assert.rejects(inspectPrintSource(Buffer.from('not an image')), { code: 'unsupported_source' })
})
