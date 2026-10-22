import { describe, test, expect } from 'bun:test'
import { requireCertificateAdmin } from './adminAuth.server.js'
import { issueCertificate } from './issueCertificate.server.js'

const req = (auth) => ({ headers: { get: (k) => (k === 'authorization' ? auth : null) } })
const userClient = ({ user = { id: 'admin' }, isAdmin = true, roleError = null } = {}) => () => ({
  auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'bad' } }) },
  rpc: async () => ({ data: isAdmin, error: roleError }),
})

describe('certificate admin authorization', () => {
  test('anonymous → 401', async () => {
    await expect(requireCertificateAdmin(req(null), { makeUserClient: userClient() })).rejects.toMatchObject({ status: 401 })
  })
  test('invalid session → 401', async () => {
    await expect(requireCertificateAdmin(req('Bearer x'), { makeUserClient: userClient({ user: null }) })).rejects.toMatchObject({ status: 401 })
  })
  test('normal user → 403', async () => {
    await expect(requireCertificateAdmin(req('Bearer x'), { makeUserClient: userClient({ isAdmin: false }) })).rejects.toMatchObject({ status: 403 })
  })
  test('role check failure denies with 503', async () => {
    await expect(requireCertificateAdmin(req('Bearer x'), { makeUserClient: userClient({ roleError: { message: 'x' } }) })).rejects.toMatchObject({ status: 503 })
  })
  test('admin → allowed', async () => {
    const { user } = await requireCertificateAdmin(req('Bearer x'), { makeUserClient: userClient() })
    expect(user.id).toBe('admin')
  })
})

const A = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
function fakeDb({ existing = null, artwork }) {
  const calls = { rpc: [] }
  const query = (result) => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: result(), error: null }) }; return q }
  const db = {
    calls,
    from: (table) => query(() => (table === 'certificates' ? db.state.existing : artwork)),
    rpc: async (name, args) => { calls.rpc.push(args); const cert = { id: 'c1', data_hash: args._data_hash, issued_at: args._issued_at, certificate_number: args._certificate_number }; db.state.existing = cert; return { data: { created: true, certificate: cert }, error: null } },
    state: { existing },
  }
  return db
}
const artwork = { id: A, sku: 'deco-10', title: 'Urban Totem N° 01', year: 2026, pending_owner_id: U, ownership_status: 'CLAIM_PENDING' }

describe('certificate issuance', () => {
  test('new certificate freezes the linked artist full name', async () => {
    const source = { ...artwork, artist_profile_id: A, artist_profile: { full_name: 'Josué Beltrán Uresti' } }
    const db = fakeDb({ artwork: source })
    await issueCertificate({ db, artworkId: A, ownerId: U, adminId: 'admin' })
    source.artist_profile.full_name = 'Cambio posterior'
    expect(db.calls.rpc[0]._snapshot.artist).toBe('Josué Beltrán Uresti')
  })
  test('linked artist without full_name prevents issuance before RPC', async () => {
    const db = fakeDb({ artwork: { ...artwork, artist_profile_id: A, artist_profile: null } })
    await expect(issueCertificate({ db, artworkId: A, ownerId: U, adminId: 'admin' })).rejects.toMatchObject({ status: 409, code: 'artist_profile_name_missing' })
    expect(db.calls.rpc.length).toBe(0)
  })
  test('first approval creates one certificate with hash', async () => {
    const db = fakeDb({ artwork })
    const r = await issueCertificate({ db, artworkId: A, ownerId: U, adminId: 'admin', now: () => new Date('2026-10-22T17:00:00Z') })
    expect(r.created).toBe(true)
    expect(r.certificate.data_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(db.calls.rpc[0]._snapshot.title).toBe('Urban Totem N° 01')
    expect(db.calls.rpc[0]._owner_id).toBe(U)
  })
  test('second approval returns the same certificate without a new hash', async () => {
    const db = fakeDb({ artwork })
    const first = await issueCertificate({ db, artworkId: A, ownerId: U, adminId: 'admin' })
    const second = await issueCertificate({ db, artworkId: A, ownerId: U, adminId: 'admin' })
    expect(second.created).toBe(false)
    expect(second.certificate.data_hash).toBe(first.certificate.data_hash)
    expect(db.calls.rpc.length).toBe(1)
  })
  test('owner different from the claimant is rejected', async () => {
    const db = fakeDb({ artwork })
    await expect(issueCertificate({ db, artworkId: A, ownerId: '33333333-3333-4333-8333-333333333333', adminId: 'admin' })).rejects.toMatchObject({ status: 409 })
    expect(db.calls.rpc.length).toBe(0)
  })
  test('invalid ids rejected before database', async () => {
    await expect(issueCertificate({ db: fakeDb({ artwork }), artworkId: 'x', ownerId: U })).rejects.toMatchObject({ status: 400 })
  })
})
