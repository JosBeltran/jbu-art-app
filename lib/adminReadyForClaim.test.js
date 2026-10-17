import { describe, test, expect } from 'bun:test'
import { isAdminReadyForClaim, readyForClaimQuery } from './adminReadyForClaim.js'

const sold = { status: 'OWNED', ownership_status: 'SOLD', current_owner_id: null, pending_owner_id: null, claim_token: null }

describe('historical Admin READY FOR CLAIM only', () => {
  test('OWNED + SOLD without owner or claim is included', () => {
    expect(isAdminReadyForClaim(sold)).toBe(true)
  })
  for (const status of ['AVAILABLE', 'DRAFT', 'ARCHIVED']) {
    test(`${status} + SOLD is excluded`, () => {
      expect(isAdminReadyForClaim({ ...sold, status, availability_status: 'SOLD' })).toBe(false)
    })
  }
  for (const ownership_status of ['AVAILABLE', 'CLAIM_PENDING', 'CLAIMED', 'VERIFIED', 'RESERVED']) {
    test(`OWNED + ${ownership_status} is excluded`, () => {
      expect(isAdminReadyForClaim({ ...sold, ownership_status })).toBe(false)
    })
  }
  test('assigned current owner is excluded', () => {
    expect(isAdminReadyForClaim({ ...sold, current_owner_id: 'owner-1' })).toBe(false)
  })
  test('assigned pending owner is excluded', () => {
    expect(isAdminReadyForClaim({ ...sold, pending_owner_id: 'pending-1' })).toBe(false)
  })
  test('active claim is excluded', () => {
    expect(isAdminReadyForClaim(sold, { hasActiveClaim: true })).toBe(false)
  })
  test('existing claim invitation token is excluded', () => {
    expect(isAdminReadyForClaim({ ...sold, claim_token: 'invitation-1' })).toBe(false)
  })
  test('active batch is excluded', () => {
    expect(isAdminReadyForClaim(sold, { hasActiveBatch: true })).toBe(false)
  })
  test('availability alone is not an eligibility source', () => {
    expect(isAdminReadyForClaim({ ...sold, availability_status: 'NOT_FOR_SALE' })).toBe(true)
    expect(isAdminReadyForClaim({ ...sold, status: 'AVAILABLE', availability_status: 'SOLD' })).toBe(false)
  })
  test('data query enforces exact statuses and null owner fields', () => {
    const calls = []
    const query = Object.fromEntries(['from', 'select', 'eq', 'is', 'order'].map((name) => [name, (...args) => { calls.push([name, ...args]); return query }]))
    readyForClaimQuery(query)
    expect(calls).toEqual([
      ['from', 'artworks'], ['select', '*'],
      ['eq', 'status', 'OWNED'], ['eq', 'ownership_status', 'SOLD'],
      ['is', 'current_owner_id', null], ['is', 'pending_owner_id', null],
      ['is', 'claim_token', null], ['order', 'created_at', { ascending: false }],
    ])
  })
})