export const PRINT_MASTER_BUCKET = 'print-masters'
export const MAX_PRINT_SOURCE_BYTES = 25 * 1024 * 1024
export const PRINT_SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff']
export const PRINT_DPI = 300
export const MIN_SOURCE_DPI = 240

export const PRINT_ASSET_SIZES = {
  A2: { mm: [420, 594], pixels: [4961, 7016] },
  A1: { mm: [594, 841], pixels: [7016, 9933] },
}

export const PRINT_BORDER_MODES = { fit: 0, margin: 10 }

export function canonicalPrintSize(size) {
  return String(size || '').trim().match(/^(A[12])(?:[^A-Z0-9]|$)/i)?.[1].toUpperCase() || null
}
