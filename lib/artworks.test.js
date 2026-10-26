import { test, expect, mock } from 'bun:test'
let seriesError = null
let viewError = null
const rows = [
  { id: 'available', status: 'AVAILABLE', series_id: 'active', availability_status: 'AVAILABLE' },
  { id: 'sold', status: 'OWNED', series_id: 'active', availability_status: 'SOLD' },
  { id: 'archived', status: 'AVAILABLE', series_id: 'archived' },
  { id: 'upcoming', status: 'AVAILABLE', series_id: 'upcoming' },
  { id: 'outlet', status: 'OWNED', series: 'Outlet' },
  { id: 'unassigned', status: 'AVAILABLE' },
  { id: 'draft', status: 'DRAFT', series_id: 'active' },
]
const series = [
  { id: 'active', editorial_status: 'active' },
  { id: 'archived', editorial_status: 'archived' },
  { id: 'upcoming', editorial_status: 'coming_soon', auto_launch: false },
  { id: 'outlet', title: 'Outlet', editorial_status: 'outlet' },
]
let modeRows = null
let modeError = null
const client = { from(table) {
  let data = table === 'series' ? series : rows
  let isModeLookup = false
  const q = {
    select(cols = '') {
      if (table === 'artworks' && String(cols).includes('price_display_mode')) { isModeLookup = true; data = modeRows || [] }
      return q
    }, order() { return q },
    in(field, values) { data = data.filter((row) => values.includes(row[field])); return q },
    eq(field, value) { data = data.filter((row) => row[field] === value); return q },
    neq(field, value) { data = data.filter((row) => row[field] !== value); return q },
    then(resolve, reject) {
      return Promise.resolve({ data, error: isModeLookup ? modeError : table === 'series' ? seriesError : table === 'artworks_discoverable' ? viewError : null }).then(resolve, reject)
    },
  }
  return q
} }
mock.module('./supabaseClient', () => ({ supabase: client }))
const { getArtworks } = await import('./artworks.js')
test('public query combines individual eligibility and active parent, retaining sold and unassigned works', async () => {
  expect((await getArtworks()).map((row) => row.id)).toEqual(['available', 'sold', 'unassigned'])
})
test('raw-table fallback enforces the same parent visibility', async () => {
  viewError = { code: '42P01' }
  try { expect((await getArtworks()).map((row) => row.id)).toEqual(['available', 'sold', 'unassigned']) }
  finally { viewError = null }
})
test('failed Series lookup cannot leak assigned artworks', async () => {
  seriesError = { code: '42501' }
  const previous = console.error; console.error = () => {}
  try { expect(await getArtworks()).toEqual([]) }
  finally { seriesError = null; console.error = previous }
})
test('related/auction ID queries cannot bypass Series eligibility', async () => {
  expect((await getArtworks({ ids: ['sold', 'archived', 'draft'] })).map((row) => row.id)).toEqual(['sold'])
})
test('result limit is applied after eligibility filtering', async () => {
  expect((await getArtworks({ excludeId: 'available', limit: 1 })).map((row) => row.id)).toEqual(['sold'])
})
test('catalog takes CONTACT_FOR_PRICE from the table when the view lacks the column', async () => {
  modeRows = [
    { id: 'available', price_display_mode: 'CONTACT_FOR_PRICE' },
    { id: 'sold', price_display_mode: 'SHOW_PRICE' },
    { id: 'unassigned', price_display_mode: 'SHOW_PRICE' },
  ]
  try {
    const byId = Object.fromEntries((await getArtworks()).map((r) => [r.id, r.price_display_mode]))
    expect(byId).toEqual({ available: 'CONTACT_FOR_PRICE', sold: 'SHOW_PRICE', unassigned: 'SHOW_PRICE' })
  } finally { modeRows = null }
})
test('failed price-mode lookup hides prices instead of exposing them', async () => {
  modeError = { code: '42501' }
  const previous = console.error; console.error = () => {}
  try { expect((await getArtworks()).every((r) => r.price_display_mode === 'CONTACT_FOR_PRICE')).toBe(true) }
  finally { modeError = null; console.error = previous }
})
test('before migration 20261103 every work keeps SHOW_PRICE behaviour', async () => {
  modeError = { code: '42703' }
  try { expect((await getArtworks()).some((r) => 'price_display_mode' in r)).toBe(false) }
  finally { modeError = null }
})
