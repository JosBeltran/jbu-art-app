import sharp from 'sharp'
import { z } from 'zod'

export const uuid = z.uuid()
export const capability = z.string().regex(/^[0-9a-f]{64}$/)
export const bucket = 'digital-art-masters'
export const maxBytes = 50 * 1024 * 1024
export const imageTypes = { jpeg: 'image/jpeg', png: 'image/png' }

export const variantFields = z.object({
  size: z.string().trim().min(1).max(60),
  width_mm: z.number().min(1).max(2000).multipleOf(0.01),
  height_mm: z.number().min(1).max(2000).multipleOf(0.01),
  dpi: z.number().int().min(72).max(600),
  print_notes: z.string().trim().max(1000),
  currency: z.enum(['MXN', 'USD']),
  amount_minor: z.number().int().min(1).max(99999999),
  download_limit: z.number().int().min(1).max(20),
  active: z.boolean(),
})

export function fitsPrint(spec, pixels) {
  const shortSide = Math.ceil(Math.min(spec.width_mm, spec.height_mm) * spec.dpi / 25.4)
  const longSide = Math.ceil(Math.max(spec.width_mm, spec.height_mm) * spec.dpi / 25.4)
  return Math.min(pixels.pixel_width, pixels.pixel_height) >= shortSide &&
    Math.max(pixels.pixel_width, pixels.pixel_height) >= longSide
}

export async function inspectMaster(bytes) {
  if (!bytes.length || bytes.length > maxBytes) throw new Error('invalid_master')
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 160_000_000 })
  const { format, width, height, pages } = await image.metadata()
  if (!Object.hasOwn(imageTypes, format) || !width || !height || (pages ?? 1) !== 1) {
    throw new Error('invalid_master')
  }
  // Metadata alone accepts truncated files. Force a full decode without altering the master.
  await image.stats()
  return { format, pixel_width: width, pixel_height: height }
}
