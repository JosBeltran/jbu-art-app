/**
 * Texto público de una Serie según el idioma. Un solo registro sirve a ambos idiomas.
 * Español: *_es → campo legado. Inglés: *_en → *_es → campo legado
 * (misma regla que localized(): sin traducción se muestra el español).
 */
const clean = (v) => (v == null ? '' : String(v).trim())
const pick = (...values) => values.map(clean).find(Boolean) || ''

export function getLocalizedSeriesContent(series, lang = 'es') {
  if (!series) return { name: '', subtitle: '', shortDescription: '', description: '' }
  const s = series
  const en = lang === 'en'
  const es = {
    name: pick(s.name_es, s.home_headline, s.title),
    subtitle: pick(s.subtitle_es, s.home_subtitle),
    shortDescription: pick(s.short_description_es, s.home_description),
    description: pick(s.description_es, s.description),
  }
  if (!en) return es
  return {
    name: pick(s.name_en, es.name),
    subtitle: pick(s.subtitle_en, es.subtitle),
    shortDescription: pick(s.short_description_en, es.shortDescription),
    description: pick(s.description_en, es.description),
  }
}

/** Nombre localizado para un nombre de serie guardado en la obra (artwork.series). */
export function localizedSeriesName(seriesName, seriesRows, lang = 'es') {
  if (!seriesName) return ''
  const key = String(seriesName).trim().toUpperCase()
  const row = (seriesRows || []).find((s) => String(s?.title || '').trim().toUpperCase() === key)
  if (!row) return seriesName
  const en = lang === 'en'
  return en ? pick(row.name_en, row.name_es, row.title) : pick(row.name_es, row.title)
}

/** Validación: al menos un nombre (ES o EN). El inglés es opcional. */
export function hasSeriesName(form) {
  return Boolean(clean(form?.name_es) || clean(form?.name_en))
}

/** Texto del botón: EN usa cta_label_en → cta_label (español) → texto por defecto. */
export function localizedCtaLabel(series, lang = 'es', fallback = '') {
  if (!series) return fallback
  return lang === 'en' ? pick(series.cta_label_en, series.cta_label, fallback) : pick(series.cta_label, fallback)
}
