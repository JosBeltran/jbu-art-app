import { test, expect } from 'bun:test'
import { isHomeEligible, effectiveStatus, buildHomeSections } from './homeSeries.js'
import { getAvailability, isArtworkPurchasable } from './artworkStatus.js'

const now = new Date('2026-10-22T02:00:00Z')
const art = { id: 'art', series_id: 's', status: 'AVAILABLE', featured: true, primary_image_url: '/work.jpg' }
const series = { id: 's', title: 'Series', editorial_status: 'active', home_featured: true }
test('individually available artwork remains discoverable in active Series', () => {
  expect(isHomeEligible(art, [series], now)).toBe(true)
})
for (const status of ['coming_soon', 'archived', 'outlet']) {
  test(`inactive ${status} Series excludes available and sold featured works`, () => {
    for (const availability_status of ['AVAILABLE', 'SOLD']) {
      expect(isHomeEligible({ ...art, availability_status }, [{ ...series, editorial_status: status }], now)).toBe(false)
    }
  })
}
test('active Series retains sold artworks', () => {
  expect(isHomeEligible({ ...art, status: 'OWNED', availability_status: 'SOLD' }, [series], now)).toBe(true)
})
test('works with no Series retain public eligibility', () => {
  expect(isHomeEligible({ status: 'AVAILABLE' }, [], now)).toBe(true)
})
test('legacy title relationship inherits inactive Series state', () => {
  expect(isHomeEligible({ series: ' series ' }, [{ ...series, editorial_status: 'archived' }], now)).toBe(false)
})
test('assigned Series ID overrides a different active title match', () => {
  expect(isHomeEligible({ ...art, series: 'Other' }, [
    { id: 'other', title: 'Other', editorial_status: 'active' },
    { ...series, editorial_status: 'archived' },
  ], now)).toBe(false)
})
test('missing assigned parent fails closed', () => {
  expect(isHomeEligible(art, [], now)).toBe(false)
})
test('existing automatic launch makes coming soon effective active only at launch', () => {
  const scheduled = { ...series, editorial_status: 'coming_soon', auto_launch: true, launch_date: now.toISOString() }
  expect(effectiveStatus(scheduled, now)).toBe('active')
  expect(isHomeEligible(art, [scheduled], new Date(now.getTime() - 1))).toBe(false)
  expect(isHomeEligible(art, [scheduled], now)).toBe(true)
})
test('homepage cannot include inactive Series artwork images', () => {
  const sections = buildHomeSections([{ ...series, editorial_status: 'outlet' }], [art])
  expect(sections).toEqual([])
})
test('explicit SOLD is authoritative even with legacy AVAILABLE ownership', () => {
  const sold = { availability_status: 'SOLD', ownership_status: 'AVAILABLE' }
  expect(getAvailability(sold)).toBe('SOLD')
  expect(isArtworkPurchasable(sold)).toBe(false)
})
for (const ownership_status of ['SOLD', 'CLAIM_PENDING', 'CLAIMED', 'VERIFIED']) {
  test(`legacy ${ownership_status} falls back to SOLD and cannot start original checkout`, () => {
    expect(getAvailability({ ownership_status })).toBe('SOLD')
    expect(isArtworkPurchasable({ ownership_status })).toBe(false)
  })
}