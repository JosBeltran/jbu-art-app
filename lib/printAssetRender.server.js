import sharp from 'sharp'
import { PrintAssetError } from './printAssetLayout.js'

const inputOptions = { limitInputPixels: 100_000_000, failOn: 'error' }
const formats = new Set(['jpeg', 'png', 'webp', 'tiff'])
const white = '#ffffff'

export async function inspectPrintSource(input) {
  try {
    const metadata = await sharp(input, inputOptions).metadata()
    if (formats.has(metadata.format) && (metadata.pages || 1) === 1 && metadata.autoOrient?.width && metadata.autoOrient?.height) {
      return metadata.autoOrient
    }
  } catch { /* report a format/decode failure without leaking decoder internals */ }
  throw new PrintAssetError('unsupported_source')
}

async function placedArtwork(input, width, height) {
  try {
    return await sharp(input, inputOptions).autoOrient()
      .resize(width, height, { fit: 'contain', background: white })
      .withIccProfile('srgb', { attach: false })
      .flatten({ background: white }).raw().toBuffer({ resolveWithObject: true })
  } catch {
    throw new PrintAssetError('unsupported_source')
  }
}

function rawLayer(artwork, left, top) {
  const { width, height, channels } = artwork.info
  return { input: artwork.data, raw: { width, height, channels }, left, top }
}

export async function renderPrintPreview(input, geometry) {
  const { width, height, left, top, artworkWidth, artworkHeight } = geometry
  const scale = 720 / Math.max(width, height)
  const paperWidth = Math.round(width * scale)
  const paperHeight = Math.round(height * scale)
  const x = Math.min(paperWidth - 1, Math.round(left * scale))
  const y = Math.min(paperHeight - 1, Math.round(top * scale))
  const imageWidth = Math.max(1, Math.round((left + artworkWidth) * scale) - x)
  const imageHeight = Math.max(1, Math.round((top + artworkHeight) * scale) - y)
  const artwork = await placedArtwork(input, imageWidth, imageHeight)
  const paper = await sharp({ create: { width: paperWidth, height: paperHeight, channels: 3, background: white } })
    .composite([rawLayer(artwork, x, y)]).raw().toBuffer({ resolveWithObject: true })
  return sharp({ create: { width: paperWidth + 88, height: paperHeight + 88, channels: 3, background: '#e8e8e8' } })
    .composite([rawLayer(paper, 44, 44)]).webp({ quality: 82 }).toBuffer()
}

export async function renderPrintAsset(input, geometry) {
  const { width, height, artworkWidth, artworkHeight, left, top, outputDpi } = geometry
  const artwork = await placedArtwork(input, artworkWidth, artworkHeight)
  const master = await sharp({ create: { width, height, channels: 3, background: white } })
    .composite([rawLayer(artwork, left, top)])
    .withMetadata({ density: outputDpi })
    .jpeg({ quality: 97, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()

  return { master, preview: await renderPrintPreview(input, geometry) }
}
