import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { printCartBucket, limitedPrintStorageKey } from '../lib/printCartRouting.mjs'

test('OPEN edition remains guest-checkout eligible', () => {
  assert.equal(printCartBucket('OPEN', null), 'guest')
  assert.equal(printCartBucket('OPEN', 'collector-1'), 'guest')
})

test('LIMITED edition requires collector authentication', () => {
  assert.equal(printCartBucket('LIMITED', null), null)
  assert.equal(printCartBucket('LIMITED', 'collector-1'), 'collector')
  assert.equal(printCartBucket('ORIGINAL', 'collector-1'), null)
})

test('collector print storage is isolated per user', () => {
  assert.notEqual(limitedPrintStorageKey('collector-1'), limitedPrintStorageKey('collector-2'))
  assert.throws(() => limitedPrintStorageKey(null), /collector_required/)
})

test('LIMITED checkout cannot charge without an inventory reservation', () => {
  const checkout = readFileSync(new URL('../app/api/checkout/route.js', import.meta.url), 'utf8')
  assert.match(checkout, /limited_print_checkout_requires_inventory_reservation/)
})
