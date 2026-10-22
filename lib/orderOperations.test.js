import { test, expect } from 'bun:test'
import { orderUpdate, persistOrder, ORDER_STATUSES } from './orderOperations.js'

const input = { status: 'PROCESSING', courier_name: 'DHL', tracking_number: '123', tracking_url: 'https://dhl.com/track/123', notes: 'Packing' }
const original = { id: 'order', status: 'PAYMENT_RECEIVED', total_amount_mxn: 45000, stripe_session_id: 'immutable', current_owner_id: 'owner', certificate_hash: 'certificate' }
const time = '2026-10-22T02:00:00Z'
function fakeDB(mode = 'save') {
  let stored = { ...original }
  let reads = 0
  return {
    stored: () => stored,
    from() {
      let payload
      const q = {
        select() { return q }, eq() { return q }, update(value) { payload = value; return q },
        async maybeSingle() {
          if (payload) {
            if (mode === 'zero') return { data: null, error: null }
            if (mode === 'enum') return { data: null, error: { code: '22P02' } }
            stored = { ...stored, ...payload }
            return { data: { ...stored }, error: null }
          }
          reads++
          return { data: mode === 'stale' && reads > 1 ? original : { ...stored }, error: null }
        },
      }
      return q
    },
  }
}
test('existing operational status values remain supported', () => {
  expect(ORDER_STATUSES).toEqual(['PAYMENT_RECEIVED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
  for (const status of ORDER_STATUSES) expect(orderUpdate({ ...input, status }, original, time).status).toBe(status)
})
test('invalid status is rejected', () => {
  expect(() => orderUpdate({ ...input, status: 'PAID_FAKE' }, original, time)).toThrow('invalid_status')
})
for (const field of ['id', 'stripe_session_id', 'stripe_payment_intent_id', 'total_amount_mxn', 'current_owner_id', 'certificate_hash']) {
  test(`immutable ${field} is rejected`, () => {
    expect(() => orderUpdate({ ...input, [field]: 'changed' }, original, time)).toThrow('immutable_field')
  })
}
test('shipping and delivery dates are stamped once without clearing prior dates', () => {
  expect(orderUpdate({ ...input, status: 'SHIPPED' }, original, time).shipped_at).toBe(time)
  expect(orderUpdate({ ...input, status: 'DELIVERED' }, original, time).delivered_at).toBe(time)
  expect(orderUpdate({ ...input, status: 'SHIPPED' }, { ...original, shipped_at: 'existing' }, time)).not.toHaveProperty('shipped_at')
  expect(orderUpdate(input, { ...original, delivered_at: 'existing' }, time)).not.toHaveProperty('delivered_at')
})
test('tracking URL rejects executable protocols', () => {
  expect(() => orderUpdate({ ...input, tracking_url: 'javascript:alert(1)' }, original, time)).toThrow('invalid_tracking_url')
})
test('status, carrier, tracking and notes persist and read back without financial edits', async () => {
  const db = fakeDB()
  const saved = await persistOrder(db, 'order', input)
  expect(saved.status).toBe('PROCESSING')
  expect(saved.courier_name).toBe('DHL')
  expect(saved.tracking_number).toBe('123')
  expect(saved.notes).toBe('Packing')
  expect(db.stored().total_amount_mxn).toBe(45000)
  expect(db.stored().stripe_session_id).toBe('immutable')
  expect(db.stored().current_owner_id).toBe('owner')
  expect(db.stored().certificate_hash).toBe('certificate')
})
test('error-free zero-row update never reports success', async () => {
  await expect(persistOrder(fakeDB('zero'), 'order', input)).rejects.toThrow('order_not_updated')
})
test('readback mismatch never reports success', async () => {
  await expect(persistOrder(fakeDB('stale'), 'order', input)).rejects.toThrow('order_verify_failed')
})
test('production enum error retains diagnostic code', async () => {
  try { await persistOrder(fakeDB('enum'), 'order', input); throw new Error('expected failure') }
  catch (error) { expect(error.code).toBe('22P02') }
})