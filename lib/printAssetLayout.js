import { PRINT_ASSET_SIZES, PRINT_DPI } from './printAssetPresets.js'

export const PRINT_LAYOUT_MODES = ['quality', 'balanced', 'coverage']
export const PRINT_OUTPUT_DPI = [150, 240, PRINT_DPI]

export class PrintAssetError extends Error {
  constructor(code, status = 400, details) {
    super(code)
    this.code = code
    this.status = status
    this.details = details
  }
}

function configured(value, min, max, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback
}

export function printLayoutPolicy(env = process.env) {
  const qualityDpi = configured(env.PRINT_LAYOUT_QUALITY_DPI, 150, 600, 240)
  const balancedMinDpi = configured(env.PRINT_LAYOUT_BALANCED_MIN_DPI, 1, qualityDpi, 150)
  return {
    qualityDpi,
    balancedMinDpi,
    balancedDpi: configured(env.PRINT_LAYOUT_BALANCED_DPI, balancedMinDpi, qualityDpi,
      Math.min(qualityDpi, Math.max(balancedMinDpi, 180))),
    minimumBorderMm: configured(env.PRINT_LAYOUT_MIN_BORDER_MM, 10, 200, 10),
    smallArtworkPercent: configured(env.PRINT_LAYOUT_SMALL_AREA_PERCENT, 1, 95, 25),
    outputDpi: PRINT_DPI,
  }
}

export function printLayoutOptions(input, policy) {
  const mode = input.mode ?? 'quality'
  const outputDpi = input.outputDpi == null ? policy.outputDpi : Number(input.outputDpi)
  const borderMm = input.borderMm == null ? policy.minimumBorderMm : Number(input.borderMm)
  const balancedDpi = input.balancedDpi == null ? policy.balancedDpi : Number(input.balancedDpi)
  if (!PRINT_LAYOUT_MODES.includes(mode) || !PRINT_OUTPUT_DPI.includes(outputDpi) ||
    !Number.isFinite(borderMm) || borderMm < policy.minimumBorderMm || borderMm > 200 ||
    (mode === 'balanced' && (!Number.isInteger(balancedDpi) || balancedDpi < policy.balancedMinDpi || balancedDpi > policy.qualityDpi))) {
    throw new PrintAssetError('invalid_layout')
  }
  return { mode, outputDpi, borderMm, balancedDpi: mode === 'balanced' ? balancedDpi : policy.balancedDpi }
}

export function printAssetGeometry(size, options, source, policy = printLayoutPolicy()) {
  const preset = Object.hasOwn(PRINT_ASSET_SIZES, size) ? PRINT_ASSET_SIZES[size] : null
  if (!preset || !Number.isInteger(source?.width) || source.width < 1 || !Number.isInteger(source.height) || source.height < 1)
    throw new PrintAssetError('invalid_layout')
  const { mode, outputDpi, borderMm, balancedDpi } = options
  const [paperWidthMm, paperHeightMm] = source.width > source.height ? [...preset.mm].reverse() : preset.mm
  const width = Math.round(paperWidthMm / 25.4 * outputDpi)
  const height = Math.round(paperHeightMm / 25.4 * outputDpi)
  const pxPerMmX = width / paperWidthMm
  const pxPerMmY = height / paperHeightMm
  const innerWidth = width - 2 * Math.ceil(borderMm * pxPerMmX)
  const innerHeight = height - 2 * Math.ceil(borderMm * pxPerMmY)
  if (innerWidth < 1 || innerHeight < 1) throw new PrintAssetError('invalid_layout')
  const paperScale = Math.min(innerWidth / source.width, innerHeight / source.height)
  const targetDpi = mode === 'quality' ? policy.qualityDpi : mode === 'balanced' ? balancedDpi : null
  const scale = targetDpi == null ? paperScale : Math.min(paperScale, pxPerMmX * 25.4 / targetDpi, pxPerMmY * 25.4 / targetDpi)
  const artworkWidth = Math.max(1, Math.floor(source.width * scale + 1e-8))
  const artworkHeight = Math.max(1, Math.floor(source.height * scale + 1e-8))
  const left = Math.floor((width - artworkWidth) / 2)
  const top = Math.floor((height - artworkHeight) / 2)
  const artworkWidthMm = artworkWidth / pxPerMmX
  const artworkHeightMm = artworkHeight / pxPerMmY
  const effectiveDpi = Math.min(source.width * 25.4 / artworkWidthMm, source.height * 25.4 / artworkHeightMm)
  return {
    size, mode, outputDpi, targetDpi, width, height, artworkWidth, artworkHeight, left, top,
    sourceWidth: source.width, sourceHeight: source.height, paperWidthMm, paperHeightMm,
    artworkWidthMm, artworkHeightMm, effectiveDpi,
    marginsMm: {
      left: left / pxPerMmX, right: (width - artworkWidth - left) / pxPerMmX,
      top: top / pxPerMmY, bottom: (height - artworkHeight - top) / pxPerMmY,
    },
    smallArtwork: (artworkWidth * artworkHeight) / (width * height) * 100 < policy.smallArtworkPercent,
    belowQuality: effectiveDpi + 1e-8 < policy.qualityDpi,
    interpolates: artworkWidth > source.width || artworkHeight > source.height,
  }
}
