import { describe, test, expect } from 'bun:test'
import { canonicalCertificateString, certificateDataHash, buildSnapshot, certificateNumberFor } from './canonicalize.js'
import { isCertificateVerified } from './status.js'

const artwork = { id: 'a1', sku: 'deco-10', title: 'Urban Totem N° 01', artist: 'Josué Beltrán', year: 2026, medium: '', technique: 'Óleo', dimensions: '200 × 145 cm', edition: undefined, edition_type: null, primary_image_url: 'https://x/img.jpg' }
const input = { certificateNumber: 'COA-DECO-10', artworkId: 'a1', ownerId: 'u1', issuedAt: '2026-10-22T17:00:00.000Z', snapshot: buildSnapshot(artwork) }

describe('canonical certificate hash', () => {
  test('is deterministic SHA-256 hex', () => {
    expect(certificateDataHash(input)).toMatch(/^[0-9a-f]{64}$/)
    expect(certificateDataHash(input)).toBe(certificateDataHash({ ...input }))
  })
  test('property order of the source artwork does not matter', () => {
    const reversed = Object.fromEntries(Object.entries(artwork).reverse())
    expect(certificateDataHash({ ...input, snapshot: buildSnapshot(reversed) })).toBe(certificateDataHash(input))
  })
  test('null, undefined and empty strings normalize the same', () => {
    const json = JSON.parse(canonicalCertificateString(input))
    expect(json.medium).toBeNull()
    expect(json.edition).toBeNull()
    expect(json.edition_type).toBeNull()
    expect(json.year).toBe('2026')
  })
  test('changing the title changes the hash', () => {
    const edited = buildSnapshot({ ...artwork, title: 'Otro título' })
    expect(certificateDataHash({ ...input, snapshot: edited })).not.toBe(certificateDataHash(input))
  })
  test('snapshot is a copy: later artwork edits do not alter it', () => {
    const source = { ...artwork }
    const snapshot = buildSnapshot(source)
    source.title = 'Editado después'
    expect(snapshot.title).toBe('Urban Totem N° 01')
  })
  test('fixed field order', () => {
    expect(Object.keys(JSON.parse(canonicalCertificateString(input)))).toEqual(['canonical_version', 'certificate_number', 'artwork_id', 'sku', 'title', 'artist', 'year', 'medium', 'technique', 'dimensions', 'edition', 'edition_type', 'owner_id', 'issued_at'])
  })
  test('certificate number keeps existing value or COA-SKU', () => {
    expect(certificateNumberFor({ sku: 'deco-10' })).toBe('COA-DECO-10')
    expect(certificateNumberFor({ sku: 'deco-10', certificate_number: 'JBU-7' })).toBe('JBU-7')
    expect(certificateNumberFor({ sku: 'deco-10' }, 2)).toBe('COA-DECO-10-V2')
  })
})

describe('verified rule', () => {
  test('null ownership is never verified', () => {
    expect(isCertificateVerified({ ownership_status: null, certificate_hash: 'h', certificate_issued_at: 'd' })).toBe(false)
  })
  test('issued date alone is not enough', () => {
    expect(isCertificateVerified({ ownership_status: 'SOLD', certificate_issued_at: 'd' })).toBe(false)
  })
  test('VERIFIED with hash and issue date is verified', () => {
    expect(isCertificateVerified({ ownership_status: 'VERIFIED', certificate_hash: 'h', certificate_issued_at: 'd' })).toBe(true)
  })
})
