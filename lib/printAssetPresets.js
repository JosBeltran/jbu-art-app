export const PRINT_MASTER_BUCKET = 'print-masters'
export const MAX_PRINT_SOURCE_BYTES = 50 * 1024 * 1024
export const PRINT_SOURCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff']
export const PRINT_DPI = 300

export const PRINT_ASSET_SIZES = {
  A2: { mm: [420, 594] },
  A1: { mm: [594, 841] },
  A0: { mm: [841, 1189] },
  A3: { mm: [297, 420] },
  A4: { mm: [210, 297] },
  '30X40CM': { mm: [300, 400], label: '30 × 40 cm' },
  '50X70CM': { mm: [500, 700], label: '50 × 70 cm' },
  '30X30CM': { mm: [300, 300], label: '30 × 30 cm' },
  '12X16IN': { mm: [304.8, 406.4], label: '12 × 16 in' },
}

export function canonicalPrintSize(size) {
  const raw=String(size || '').trim()
  const iso=raw.match(/^(A[0-4])(?:[^A-Z0-9]|$)/i)?.[1]
  if(iso)return iso.toUpperCase()
  const key=raw.split(/\s*[·|]/)[0].trim()
  return Object.keys(PRINT_ASSET_SIZES).find(code=>code===key.toUpperCase() || PRINT_ASSET_SIZES[code].label===key) || null
}

