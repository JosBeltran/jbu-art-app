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
const client = { from(table) {
  let data = table === 'series' ? series : rows
  const q = {
    select() { return q }, order() { return q },
    in(field, values) { data = data.filter((row) => values.includes(row[field])); return q },
    eq(field, value) { data = data.filter((row) => row[field] === value); return q },
    neq(field, value) { data = data.filter((row) => row[field] !== value); return q },
    then(resolve, reject) {
      return Promise.resolve({ data, error: table === 'series' ? seriesError : table === 'artworks_discoverable' ? viewError : null }).then(resolve, reject)
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