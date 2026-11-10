import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import { fitsPrint, inspectMaster, variantFields } from './validation.js'

test('effective print resolution uses pixel dimensions for either orientation', () => {
  const a3 = { width_mm: 297, height_mm: 420, dpi: 300 }
  assert.equal(fitsPrint(a3, { pixel_width: 3510, pixel_height: 4961 }), true)
  assert.equal(fitsPrint(a3, { pixel_width: 4961, pixel_height: 3510 }), true)
  assert.equal(fitsPrint(a3, { pixel_width: 3507, pixel_height: 5000 }), false)
})

test('master validation decodes JPEG and PNG, rejecting invalid, truncated and unsupported content', async () => {
  const image = sharp({ create: { width: 32, height: 24, channels: 3, background: '#712e98' } })
  for (const format of ['jpeg', 'png']) {
    const bytes = await image.clone().toFormat(format).toBuffer()
    assert.deepEqual(await inspectMaster(bytes), { format, pixel_width: 32, pixel_height: 24 })
    await assert.rejects(inspectMaster(bytes.subarray(0, Math.floor(bytes.length / 2))))
  }
  await assert.rejects(inspectMaster(Buffer.from('not an image')))
  await assert.rejects(inspectMaster(await image.clone().webp().toBuffer()))
})

test('variant validation accepts configured prices only as integer minor units in supported currencies', () => {
  const fields = {
    size: 'A3', width_mm: 297.25, height_mm: 420, dpi: 300,
    print_notes: 'Fine art paper', currency: 'MXN', amount_minor: 25050, download_limit: 3, active: false,
  }
  assert.equal(variantFields.safeParse(fields).success, true)
  for (const overrides of [{ amount_minor: 25.5 }, { currency: 'EUR' }, { download_limit: 0 }, { width_mm: 297.251 }]) {
    assert.equal(variantFields.safeParse({ ...fields, ...overrides }).success, false)
  }
})
