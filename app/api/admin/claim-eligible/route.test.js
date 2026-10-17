import { test, expect, mock } from 'bun:test'
import { isAdminReadyForClaim, readyForClaimQuery } from '../../../../lib/adminReadyForClaim.js'
import { needsStatusReview } from '../../../../lib/artworkStatus.js'

const base = { status: 'OWNED', ownership_status: 'SOLD', current_owner_id: null, pending_owner_id: null, claim_token: null, base_price_mxn: 12000 }
const artworks = [
  { ...base, id: 'ready' },
  { ...base, id: 'available', status: 'AVAILABLE', availability_status: 'SOLD' },
  { ...base, id: 'draft', status: 'DRAFT' },
  { ...base, id: 'pending', ownership_status: 'CLAIM_PENDING' },
  { ...base, id: 'verified', ownership_status: 'VERIFIED' },
  { ...base, id: 'owned', current_owner_id: 'collector-1' },
  { ...base, id: 'pending-owner', pending_owner_id: 'collector-2' },
  { ...base, id: 'token', claim_token: 'active-invitation' },
  { ...base, id: 'batch' },
  { ...base, id: 'review', ownership_status: 'AVAILABLE', current_owner_id: 'collector-3' },
]
let batchError = null
const client = {
  from(table) {
    let rows = table === 'artworks' ? [...artworks] : [{ artwork_id: 'batch', claim_group_id: 'group-1', is_claimed: false }]
    const q = {
      select() { return q },
      eq(field, value) { rows = rows.filter((row) => row[field] === value); return q },
      is(field, value) { rows = rows.filter((row) => row[field] === value); return q },
      not(field, operator, value) { rows = rows.filter((row) => row[field] !== value); return q },
      order() { return q },
      then(resolve, reject) { return Promise.resolve({ data: rows, error: table === 'order_items' ? batchError : null }).then(resolve, reject) },
    }
    return q
  },
}
mock.module('@supabase/supabase-js', () => ({ createClient: () => client }))
mock.module('@/lib/artworkStatus', () => ({ needsStatusReview }))
mock.module('@/lib/adminReadyForClaim', () => ({ isAdminReadyForClaim, readyForClaimQuery }))
const { GET } = await import('./route.js')

test('server list returns only eligible historical works, excludes batches, preserves NEEDS REVIEW', async () => {
  const response = await GET()
  expect(response.status).toBe(200)
  const data = await response.json()
  expect(data.ready.map((art) => art.id)).toEqual(['ready'])
  expect(data.ready[0].price).toBe(12000)
  expect(data.needsReview.map((art) => art.id)).toEqual(['review'])
})

test('failed active-batch lookup never returns eligible candidates', async () => {
  batchError = { message: 'Batch lookup unavailable' }
  const previousError = console.error
  console.error = () => {}
  try {
    const response = await GET()
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Batch lookup unavailable' })
  } finally {
    batchError = null
    console.error = previousError
  }
})