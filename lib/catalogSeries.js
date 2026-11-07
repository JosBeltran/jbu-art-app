/** Shared, case- and whitespace-insensitive identity for legacy artwork.series values. */
export function seriesKey(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')
}

export function sameSeries(a, b) {
  return Boolean(seriesKey(a)) && seriesKey(a) === seriesKey(b)
}

/**
 * A single option for each logical series, even when artwork rows use
 * capitalization or whitespace variants of its title.
 * Keep a real title as the URL value, never a localized display name.
 */
export function uniqueArtworkSeries(artworks, seriesRows = []) {
  const keys = new Set()
  const values = []
  for (const artwork of artworks || []) {
    const raw = String(artwork?.series || '').trim()
    const key = seriesKey(raw)
    if (!key || keys.has(key)) continue
    keys.add(key)
    const canonical = (seriesRows || []).find(row => sameSeries(row?.title, raw))?.title
    values.push(String(canonical || raw).trim())
  }
  return values
}

/** Resolve shareable URL filters even if the casing differs from DB records. */
export function resolveSeriesValue(wanted, artworks = [], seriesRows = []) {
  if (!wanted || seriesKey(wanted) === 'all') return 'ALL'
  const match = uniqueArtworkSeries(artworks, seriesRows).find(value => sameSeries(value, wanted))
  if (match) return match
  const row = seriesRows.find(series => sameSeries(series?.title, wanted))
  return row ? String(row.title).trim() : 'ALL'
}
