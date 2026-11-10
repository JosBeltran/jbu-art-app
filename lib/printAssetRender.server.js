import sharp from 'sharp'
import { MIN_SOURCE_DPI, PRINT_ASSET_SIZES, PRINT_BORDER_MODES, PRINT_DPI } from './printAssetPresets.js'

const inputOptions = { limitInputPixels: 100_000_000, failOn: 'error' }
const formats = new Set(['jpeg', 'png', 'webp', 'tiff'])
const white = '#ffffff'

export class PrintAssetError extends Error {
  constructor(code, status = 400, details) {
    super(code)
    this.code = code
    this.status = status
    this.details = details
  }
}

export async function inspectPrintSource(input) {
  try {
    const metadata = await sharp(input, inputOptions).metadata()
    if (formats.has(metadata.format) && (metadata.pages || 1) === 1 && metadata.autoOrient?.width && metadata.autoOrient?.height) {
      return metadata.autoOrient
    }
  } catch { /* report a format/decode failure without leaking decoder internals */ }
  throw new PrintAssetError('unsupported_source')
}

export function printAssetGeometry(size, borderMode, source) {
  const preset = PRINT_ASSET_SIZES[size]
  if (!preset || !Object.hasOwn(PRINT_BORDER_MODES, borderMode)) throw new PrintAssetError('invalid_options')
  const [width, height] = source.width > source.height ? [...preset.pixels].reverse() : preset.pixels
  const margin = Math.ceil(PRINT_BORDER_MODES[borderMode] / 25.4 * PRINT_DPI)
  const scale = Math.min((width - 2 * margin) / source.width, (height - 2 * margin) / source.height)
  const artworkWidth = Math.max(1, Math.round(source.width * scale))
  const artworkHeight = Math.max(1, Math.round(source.height * scale))
  const effectiveDpi = Math.floor(Math.min(source.width / artworkWidth, source.height / artworkHeight) * PRINT_DPI)
  if (effectiveDpi < MIN_SOURCE_DPI) {
    throw new PrintAssetError('insufficient_resolution', 422, { size, effectiveDpi, minimumDpi: MIN_SOURCE_DPI })
  }
  return {
    width, height, artworkWidth, artworkHeight, effectiveDpi,
    left: Math.floor((width - artworkWidth) / 2),
    top: Math.floor((height - artworkHeight) / 2),
  }
}

export async function renderPrintAsset(input, geometry) {
  const { width, height, artworkWidth, artworkHeight, left, top } = geometry
  let artwork
  try {
    artwork = await sharp(input, inputOptions).autoOrient()
      .resize(artworkWidth, artworkHeight, { fit: 'fill' })
      .withIccProfile('srgb', { attach: false })
      .flatten({ background: white }).raw().toBuffer({ resolveWithObject: true })
  } catch {
    throw new PrintAssetError('unsupported_source')
  }
  const master = await sharp({ create: { width, height, channels: 3, background: white } })
    .composite([{ input: artwork.data, raw: { width: artworkWidth, height: artworkHeight, channels: artwork.info.channels }, left, top }])
    .withMetadata({ density: PRINT_DPI })
    .jpeg({ quality: 97, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()

  const scale = 720 / Math.max(width, height)
  const paperWidth = Math.round(width * scale)
  const paperHeight = Math.round(height * scale)
  const paper = await sharp(master).resize(paperWidth, paperHeight).raw().toBuffer()
  const preview = await sharp({ create: { width: paperWidth + 88, height: paperHeight + 88, channels: 3, background: '#e8e8e8' } })
    .composite([{ input: paper, raw: { width: paperWidth, height: paperHeight, channels: 3 }, left: 44, top: 44 }])
    .webp({ quality: 82 }).toBuffer()
  return { master, preview }
}
