import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { inspectPrintSource, renderPrintAsset, renderPrintPreview } from './printAssetRender.server.js'
import { printAssetGeometry, printLayoutOptions, printLayoutPolicy } from './printAssetLayout.js'

const policy = printLayoutPolicy({})
const layout = (size, source, input = {}, rules = policy) => printAssetGeometry(size, printLayoutOptions(input, rules), source, rules)

test('A2 production JPEG keeps the whole image, white paper and 300 DPI, and the preview is a separate small WebP', async () => {
  const input = await sharp({ create: { width: 4900, height: 5100, channels: 3, background: '#1369c2' } }).png().toBuffer()
  const geometry = layout('A2', await inspectPrintSource(input))
  assert.equal(geometry.width, 4961)
  assert.equal(geometry.height, 7016)
  assert.ok(geometry.left >= 118 && geometry.top > 118)
  const { master, preview } = await renderPrintAsset(input, geometry)
  assert.deepEqual(preview, await renderPrintPreview(input, geometry))
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

test('A2 fixes the 167 DPI case by shrinking proportionally, leaving centered white margins', () => {
  const source = { width: 2630, height: 3700 }
  const coverage = layout('A2', source, { mode: 'coverage' })
  const quality = layout('A2', source)
  const balanced = layout('A2', source, { mode: 'balanced', balancedDpi: 180 })
  assert.equal(Math.round(coverage.effectiveDpi), 167)
  assert.ok(quality.effectiveDpi >= 240 && quality.effectiveDpi < 241)
  assert.ok(balanced.effectiveDpi >= 180 && balanced.effectiveDpi < 181)
  assert.ok(coverage.artworkWidthMm > balanced.artworkWidthMm && balanced.artworkWidthMm > quality.artworkWidthMm)
  assert.ok(Object.values(coverage.marginsMm).every(mm => mm >= 10))
  assert.ok(quality.marginsMm.left > 70)
  assert.ok(Math.abs(quality.marginsMm.left - quality.marginsMm.right) < 0.1)
  assert.ok(Math.abs(quality.marginsMm.top - quality.marginsMm.bottom) < 0.1)
  assert.ok(Math.abs(quality.artworkWidth / quality.artworkHeight - source.width / source.height) < 0.001)
  const actualDpi = Math.min(source.width / (quality.artworkWidthMm / 25.4), source.height / (quality.artworkHeightMm / 25.4))
  assert.equal(Math.abs(actualDpi - quality.effectiveDpi) < 1e-9, true)
  assert.equal(quality.interpolates, true)
  const withoutInterpolation = layout('A2', source, { outputDpi: 240 })
  assert.equal(withoutInterpolation.interpolates, false)
  assert.ok(Math.abs(withoutInterpolation.artworkWidthMm - quality.artworkWidthMm) < 0.2)
})

test('A1 honors EXIF orientation and warns on small placement instead of rejecting', async () => {
  const input = await sharp({ create: { width: 700, height: 1000, channels: 3, background: '#7951a4' } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer()
  const source = await inspectPrintSource(input)
  assert.deepEqual([source.width, source.height], [1000, 700])
  const geometry = layout('A1', source, { outputDpi: 240 })
  assert.deepEqual([geometry.paperWidthMm, geometry.paperHeightMm], [841, 594])
  assert.equal(geometry.smallArtwork, true)
  assert.equal(geometry.interpolates, false)
  await assert.rejects(inspectPrintSource(Buffer.from('not an image')), { code: 'unsupported_source' })
})

test('configurable policy controls the selected target and margin', () => {
  const rules = printLayoutPolicy({ PRINT_LAYOUT_QUALITY_DPI: '260', PRINT_LAYOUT_BALANCED_MIN_DPI: '160', PRINT_LAYOUT_MIN_BORDER_MM: '15' })
  const geometry = layout('A1', { width: 7200, height: 5400 }, {}, rules)
  assert.equal(geometry.targetDpi, 260)
  assert.ok(Object.values(geometry.marginsMm).every(mm => mm >= 15))
  assert.throws(() => printLayoutOptions({ mode: 'balanced', balancedDpi: 150 }, rules), { code: 'invalid_layout' })
})
