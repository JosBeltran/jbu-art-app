/**
 * Selección de contenido del Hero de portada — fuente única de verdad.
 *
 * El modo configurado en Admin (hero_settings.mode) decide la fuente:
 *  - FEATURED: obras destacadas actuales (la lógica featured existente).
 *  - IMAGES / VIDEOS: elementos personalizados de hero_slides.
 *
 * Si el modo elegido no tiene elementos válidos, se cae a FEATURED en
 * lugar de dejar el Hero vacío. Nunca se mezclan fuentes.
 */

export const HERO_MODES = ['FEATURED', 'IMAGES', 'VIDEOS']

const norm = (v) => String(v ?? '').trim().toUpperCase()

/** Modo configurado; FEATURED si la configuración no existe o no es válida. */
export function resolveHeroMode(settings) {
  const mode = norm(settings?.mode)
  return HERO_MODES.includes(mode) ? mode : 'FEATURED'
}

/** ¿El elemento personalizado tiene lo mínimo para mostrarse? */
export function isValidCustomSlide(slide) {
  return Boolean(slide && slide.enabled !== false && typeof slide.url === 'string' && slide.url.trim())
}

/**
 * Elementos personalizados utilizables para un modo, en orden configurado.
 * IMAGES solo acepta kind IMAGE; VIDEOS solo acepta kind VIDEO.
 */
export function selectCustomSlides(slides, mode) {
  const kind = mode === 'VIDEOS' ? 'VIDEO' : 'IMAGE'
  return (slides || [])
    .filter((slide) => norm(slide?.kind) === kind && isValidCustomSlide(slide))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

/**
 * Lista final de slides del Hero.
 *
 * @param {object} opts
 * @param {object|null} opts.settings  fila de hero_settings (puede no existir)
 * @param {Array}      opts.slides     filas de hero_slides (puede no existir)
 * @param {Array}      opts.featured   obras destacadas elegibles (fallback)
 * @returns {{ mode: string, slides: Array }}
 *   mode efectivo tras aplicar el fallback; slides normalizados:
 *   - custom:   { type: 'custom', kind, url, posterUrl, title, description, linkUrl, cta }
 *   - featured: { type: 'artwork', artwork }
 */
export function buildHeroSlides({ settings, slides, featured } = {}) {
  const mode = resolveHeroMode(settings)
  const featuredSlides = (featured || [])
    .filter((artwork) => artwork && artwork.primary_image_url)
    .map((artwork) => ({ type: 'artwork', artwork }))

  if (mode === 'FEATURED') {
    return { mode: 'FEATURED', slides: featuredSlides }
  }

  const custom = selectCustomSlides(slides, mode).map((slide) => ({
    type: 'custom',
    kind: norm(slide.kind),
    url: slide.url.trim(),
    posterUrl: slide.poster_url || null,
    title: { es: slide.title_es || '', en: slide.title_en || '' },
    description: { es: slide.description_es || '', en: slide.description_en || '' },
    linkUrl: slide.link_url || null,
    cta: { es: slide.cta_es || '', en: slide.cta_en || '' },
  }))

  if (custom.length > 0) {
    return { mode, slides: custom }
  }

  // Fallback: el modo elegido no tiene elementos válidos.
  return { mode: 'FEATURED', slides: featuredSlides }
}
