/**
 * Arma las secciones editoriales de la portada a partir de las Series.
 * Función pura: recibe series y obras públicas, devuelve secciones ordenadas.
 */

export const SERIES_STATUSES = ['active', 'coming_soon', 'outlet', 'archived']

const norm = (v) => String(v || '').trim().toUpperCase()
import { getAvailability } from './artworkStatus.js'

export function belongsToSeries(artwork, series) {
  if (!artwork || !series) return false
  if (artwork.series_id) return Boolean(series.id) && String(artwork.series_id) === String(series.id)
  return Boolean(artwork.series) && norm(artwork.series) === norm(series.title)
}

export function isAvailableArtwork(artwork) {
  return getAvailability(artwork) === 'AVAILABLE'
}

/** Estado efectivo: aplica el lanzamiento automático por fecha. */
export function effectiveStatus(series, now = new Date()) {
  const status = series?.editorial_status || 'active'
  if (status === 'coming_soon' && series.auto_launch && series.launch_date && new Date(series.launch_date) <= now) return 'active'
  return status
}

/**
 * Regla de portada: la Serie manda sobre "destacada"/"principal".
 * Una obra puede aparecer en espacios destacados solo si su Serie (si tiene) está activa.
 * Próximamente (sin lanzar) y archivada quedan fuera de la portada.
 */
export function isHomeEligible(artwork, seriesRows, now = new Date()) {
  const s = (seriesRows || []).find((row) => belongsToSeries(artwork, row))
  if (!s) return !artwork?.series_id
  const status = effectiveStatus(s, now)
  return status === 'active'
}

/** URL de "Ver serie": el catálogo ya filtrado. */
export function seriesHref(series) {
  return series?.cta_url || `/catalog?series=${encodeURIComponent(series?.title || '')}`
}

/**
 * @param {any[]} seriesRows
 * @param {any[]} artworks obras públicas (AVAILABLE/OWNED) con imagen
 * @param {{ heroId?: string, secondaryLimit?: number, outletLimit?: number }} opts
 */
export function buildHomeSections(seriesRows, artworks, opts = {}) {
  const { heroId, secondaryLimit = 4, outletLimit = 6 } = opts
  const now = new Date()
  const ordered = [...(seriesRows || [])].sort((a, b) => (a.home_order ?? 0) - (b.home_order ?? 0))
  const sections = []
  const outletSeries = []
  let outletOrder = null
  let layoutIndex = 0

  for (const s of ordered) {
    const status = effectiveStatus(s, now)
    if (status === 'archived') continue
    const works = (artworks || []).filter((a) => belongsToSeries(a, s) && a.primary_image_url && isHomeEligible(a, seriesRows, now))

    if (status === 'outlet') {
      outletSeries.push({ series: s, works })
      if (outletOrder === null) outletOrder = s.home_order ?? 0
      continue
    }
    if (!s.home_featured) continue

    if (status === 'coming_soon') {
      sections.push({ type: 'coming_soon', key: `cs-${s.id}`, series: s })
      continue
    }

    const featured = works.filter((a) => a.featured)
    let main = works.find((a) => String(a.id) === String(s.main_artwork_id)) || null
    const missingMain = !main
    if (!main) main = featured[0] || works[0] || null
    if (!main) continue
    const secondary = featured.filter((a) => a.id !== main.id && a.id !== heroId).slice(0, secondaryLimit)
    sections.push({ type: 'series', key: `s-${s.id}`, series: s, main, secondary, missingMain, layout: ['left', 'center', 'horizontal'][layoutIndex++ % 3] })
  }

  if (outletSeries.length) {
    const works = outletSeries
      .flatMap(({ works }) => works)
      .filter(isAvailableArtwork)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
      .slice(0, outletLimit)
    if (works.length) {
      // se inserta en la posición de la primera serie outlet según el orden de portada
      const idx = sections.findIndex((sec) => (sec.series.home_order ?? 0) > outletOrder)
      const section = { type: 'outlet', key: 'outlet', works, series: { home_order: outletOrder } }
      if (idx === -1) sections.push(section)
      else sections.splice(idx, 0, section)
    }
  }
  return sections
}
