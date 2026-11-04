import { test } from 'node:test'
import assert from 'node:assert/strict'
import { physicalEditionUnitIdentifier } from './physicalEditionIdentifier.js'

test('appends sequential physical edition numbers without changing artwork SKU', () => {
  assert.equal(physicalEditionUnitIdentifier('molten-relic-01', 1, 50), 'molten-relic-01-001')
  assert.equal(physicalEditionUnitIdentifier('molten-relic-01', 13, 50), 'molten-relic-01-013')
  assert.equal(physicalEditionUnitIdentifier('molten-relic-01', 50, 50), 'molten-relic-01-050')
})

test('pads large editions without truncating numbers', () => {
  assert.equal(physicalEditionUnitIdentifier('abc-01', 1000, 1000), 'abc-01-1000')
})

test('rejects missing, out-of-range or fractional edition numbers', () => {
  for (const [sku, number, size] of [['', 1, 50], ['abc', 0, 50], ['abc', 51, 50], ['abc', 1.2, 50], ['abc', 1, 0]]) {
    assert.throws(() => physicalEditionUnitIdentifier(sku, number, size), RangeError)
  }
})
