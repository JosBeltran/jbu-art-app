import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seriesKey, sameSeries, uniqueArtworkSeries, resolveSeriesValue } from './catalogSeries.js'

const artworks = [
  { series: 'URBAN TOTEMS' },
  { series: 'Urban Totems' },
  { series: ' Urban   Totems ' },
  { series: 'Epoxi' },
]
const seriesRows = [{ title: 'Urban Totems' }, { title: 'Epoxi' }]

test('deduplicate capitalization and whitespace variants', () => {
  assert.deepEqual(uniqueArtworkSeries(artworks, seriesRows), ['Urban Totems', 'Epoxi'])
})
test('find artwork in any capitalization variant', () => {
  assert.ok(sameSeries('URBAN TOTEMS', 'Urban Totems'))
  assert.ok(sameSeries(' Urban   Totems ', 'urban totems'))
  assert.equal(seriesKey(' EPOXI '), 'epoxi')
})
test('deep link restores canonical option from variant URL', () => {
  assert.equal(resolveSeriesValue('URBAN TOTEMS', artworks, seriesRows), 'Urban Totems')
  assert.equal(resolveSeriesValue('urban totems', artworks, seriesRows), 'Urban Totems')
})
test('clear and unknown selections behave safely', () => {
  assert.equal(resolveSeriesValue('ALL', artworks, seriesRows), 'ALL')
  assert.equal(resolveSeriesValue('', artworks, seriesRows), 'ALL')
  assert.equal(resolveSeriesValue('unknown', artworks, seriesRows), 'ALL')
})
