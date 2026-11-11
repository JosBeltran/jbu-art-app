/** Preserve unrelated catalog parameters when toggling shareable filters. */
export function catalogQueryHref(pathname, currentQuery, changes = {}) {
  const params = new URLSearchParams(currentQuery || '')
  if (changes.series !== undefined) {
    if (!changes.series || changes.series === 'ALL') params.delete('series')
    else params.set('series', changes.series)
  }
  if (changes.prints !== undefined) {
    if (changes.prints) params.set('prints', 'true')
    else params.delete('prints')
  }
  if (changes.country !== undefined) {
    if (!changes.country || changes.country === 'ALL') params.delete('country')
    else params.set('country', changes.country)
  }
  const query = params.toString()
  return pathname + (query ? '?' + query : '')
}

export function catalogFiltersFromQuery(query, knownSeries = []) {
  const params = new URLSearchParams(query || '')
  const wanted = params.get('series')?.trim().toUpperCase()
  const series = knownSeries.find(s => String(s || '').trim().toUpperCase() === wanted)
  const country = params.get('country')
  return {
    series: wanted && series ? series : 'ALL',
    prints: params.get('prints') === 'true',
    ...(country ? { country } : {}),
  }
}
