import { PRINT_ASSET_SIZES, canonicalPrintSize } from './printAssetPresets.js'

export const PRINT_SIZE_CATALOG = {
  ...PRINT_ASSET_SIZES,
  A5: { mm: [148, 210] },
  A6: { mm: [105, 148] },
  '20X30CM': { mm: [200, 300], label: '20 × 30 cm' },
  '30X45CM': { mm: [300, 450], label: '30 × 45 cm' },
  '30X50CM': { mm: [300, 500], label: '30 × 50 cm' },
  '40X50CM': { mm: [400, 500], label: '40 × 50 cm' },
  '40X60CM': { mm: [400, 600], label: '40 × 60 cm' },
  '50X70CM': { mm: [500, 700], label: '50 × 70 cm' },
  '50X75CM': { mm: [500, 750], label: '50 × 75 cm' },
  '60X80CM': { mm: [600, 800], label: '60 × 80 cm' },
  '60X90CM': { mm: [600, 900], label: '60 × 90 cm' },
  '70X100CM': { mm: [700, 1000], label: '70 × 100 cm' },
  '8X10IN': { mm: [203.2, 254], label: '8 × 10 in' },
  '16X20IN': { mm: [406.4, 508], label: '16 × 20 in' },
  '18X24IN': { mm: [457.2, 609.6], label: '18 × 24 in' },
  '20X30IN': { mm: [508, 762], label: '20 × 30 in' },
  '24X36IN': { mm: [609.6, 914.4], label: '24 × 36 in' },
}

export function normalizedPrintSize(value) {
  if (typeof value !== 'string') return null
  const raw = value.trim().toUpperCase().split(/[·|]/)[0].trim()
  if (Object.hasOwn(PRINT_SIZE_CATALOG, raw)) return raw
  const isoCode = raw.match(/^(A[0-6])(?:[^A-Z0-9]|$)/)?.[1]
  if (isoCode) return isoCode
  const iso = canonicalPrintSize(raw)
  if (iso) return iso
  const compact = raw.replace(/\s/g, '').replace(/[×*]/g, 'X')
  return Object.keys(PRINT_SIZE_CATALOG).find(code => code === compact) || null
}

export function artworkPrintSize(row) {
  // An explicit code wins over the historical commercial label.
  return row?.size_code ? (Object.hasOwn(PRINT_SIZE_CATALOG, row.size_code) ? row.size_code : null)
    : normalizedPrintSize(row?.size)
}

export function artworkPrintMatches(variant, row, artworkOrientation = null) {
  return row?.is_active === true && artworkPrintFormatMatches(variant,row,artworkOrientation)
}

export function artworkPrintFormatMatches(variant, row, artworkOrientation = null) {
  const preset = PRINT_SIZE_CATALOG[artworkPrintSize(row)]
  const w = Number(variant?.widthMm), h = Number(variant?.heightMm)
  if (!preset || !(w > 0 && h > 0)) return false
  const orientation = Math.abs(w / h - 1) < 0.01 ? 'square' : w > h ? 'landscape' : 'portrait'
  const declared = { hor:'landscape', ver:'portrait', horizontal:'landscape', vertical:'portrait',
    portrait:'portrait', landscape:'landscape', square:'square' }[String(variant.attributes?.orientation || '').toLowerCase()]
  if ((declared && orientation !== declared) || (artworkOrientation && orientation !== artworkOrientation)) return false
  const [small, large] = [...preset.mm].sort((a,b) => a-b)
  return Math.abs(Math.min(w,h)-small) <= 1 && Math.abs(Math.max(w,h)-large) <= 1
}

export function matchingArtworkPrint(variant, rows = [], artworkOrientation = null, selectedId = null) {
  return [...rows].sort((a,b) => String(a.id).localeCompare(String(b.id)))
    .find(row => (!selectedId || row.id === selectedId) && artworkPrintMatches(variant, row, artworkOrientation)) || null
}

