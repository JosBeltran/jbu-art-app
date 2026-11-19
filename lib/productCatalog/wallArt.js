export const wallArtFamilies = {
  fine_art_print: ['Fine Art', 'Fine Art'],
  poster: ['Pósteres', 'Posters'],
  canvas: ['Lienzos', 'Canvas'],
  framed_print: ['Enmarcados', 'Framed prints'],
  acrylic: ['Acrílico', 'Acrylic'],
  panel: ['Otros paneles', 'Other panels'],
}

export const wallArtProductFamily = group => group === 'poster' ? 'fine_art_print' : group === 'panel' ? 'merchandise' : group

export function wallArtGroup(product) {
  const key = [product.externalId, product.title].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ')
  if (/\b(cards?|postcard|brochure|apparel|t shirt|mug|calendar|photo book)\b/.test(key)) return null
  if (/\b(frame[ds]?|enmarcad\w*)\b/.test(key)) return 'framed_print'
  if (/\b(canvas|lienzos?)\b/.test(key)) return 'canvas'
  if (/\b(acrylic|plexiglass)\b/.test(key)) return 'acrylic'
  if (/\b(aluminum|aluminium|dibond|foam board|wood print)\b/.test(key)) return 'panel'
  if (/\b(fine art|gicl[eé]e|museum)\b/.test(key)) return 'fine_art_print'
  if (/\b(posters?|wall art|prints? matte)\b/.test(key)) return 'poster'
  return null
}

export function wallArtMoney(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits
}

export function proposedWallArtPrice(cost, margin) {
  if (!Number.isSafeInteger(cost) || cost < 1 || !Number.isFinite(margin) || margin < 0 || margin >= 100) return null
  return Math.ceil(cost * 100 / (100 - margin))
}
