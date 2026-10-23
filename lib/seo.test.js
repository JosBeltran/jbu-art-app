import { test, expect } from 'bun:test'
import { artworkTitle, artworkDescription, isIndexableArtwork } from './seo.js'

const art = { title: 'Urban Geology I — Violet', series: 'Urban Geology', medium: 'Mixed media and resin', year: 2026, dimensions: '100 × 80 cm', price: 45000, status: 'AVAILABLE' }

test('artwork title uses "[Title] | Josué Beltrán Uresti"', () => {
  expect(artworkTitle(art)).toBe('Urban Geology I — Violet | Josué Beltrán Uresti')
})
test('artwork description names series and never exposes price', () => {
  const d = artworkDescription(art)
  expect(d).toContain('from the Urban Geology series')
  expect(d).not.toContain('45000')
})
test('only public artworks are indexable', () => {
  expect(isIndexableArtwork({ status: 'DRAFT' })).toBe(false)
  expect(isIndexableArtwork({ status: 'OWNED' }, false)).toBe(false)
  expect(isIndexableArtwork({ status: 'OWNED' })).toBe(true)
})
