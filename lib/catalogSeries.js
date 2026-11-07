import { localizedSeriesName } from './seriesContent.js'

/** Shared identity for inconsistent capitalization/spacing in artwork.series. */
export function seriesKey(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}
export function sameSeries(a, b) {
  return Boolean(seriesKey(a)) && seriesKey(a) === seriesKey(b)
}
/** The displayed localized series name is the visible picklist identity. */
export function seriesDisplayKey(value, rows = [], lang = 'es') {
  return seriesKey(localizedSeriesName(value, rows, lang))
}
/** One option per localized label, regardless of legacy aliases on artworks. */
export function uniqueArtworkSeries(artworks, seriesRows = [], lang = 'es') {
  const keys = new Set()
  const values = []
  for (const artwork of artworks || []) {
    const raw = String(artwork?.series || '').trim()
    const key = seriesDisplayKey(raw, seriesRows, lang)
    if (!key || keys.has(key)) continue
    keys.add(key)
    const canonical = (seriesRows || []).find(row => sameSeries(row?.title, raw))?.title
    values.push(String(canonical || raw).trim())
  }
  return values
}
export function matchesSeriesFilter(artworkSeries, selectedSeries, seriesRows = [], lang = 'es') {
  return sameSeries(artworkSeries, selectedSeries) ||
    Boolean(seriesDisplayKey(artworkSeries, seriesRows, lang)) &&
      seriesDisplayKey(artworkSeries, seriesRows, lang) === seriesDisplayKey(selectedSeries, seriesRows, lang)
}
/** Preserve the selected category across legacy deep links and translated aliases. */
export function resolveSeriesValue(wanted, artworks = [], seriesRows = [], lang = 'es') {
  if (!wanted || seriesKey(wanted) === 'all') return 'ALL'
  const values = uniqueArtworkSeries(artworks, seriesRows, lang)
  const match = values.find(value => matchesSeriesFilter(value, wanted, seriesRows, lang))
  if (match) return match
  const row = seriesRows.find(series => sameSeries(series?.title, wanted))
  return row ? String(row.title).trim() : 'ALL'
}
