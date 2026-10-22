import { describe, test, expect } from 'bun:test'
import { requireCertificateAdmin, requireUser } from './adminAuth.server.js'
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
  test('normal user → 403 (cannot issue)', async () => {
    await expect(requireCertificateAdmin(req('Bearer x'), { makeUserClient: userClient({ isAdmin: false }) })).rejects.toMatchObject({ status: 403 })
  })
  test('role check failure denies with 503', async () => {
    await expect(requireCertificateAdmin(req('Bearer x'), { makeUserClient: userClient({ roleError: { message: 'x' } }) })).rejects.toMatchObject({ status: 503 })
  })
  test('admin → allowed', async () => {
    const { user } = await requireCertificateAdmin(req('Bearer x'), { makeUserClient: userClient() })
    expect(user.id).toBe('admin')
  })
  test('download auth: anonymous 401, user resolved without admin', async () => {
    await expect(requireUser(req(null), { makeUserClient: userClient() })).rejects.toMatchObject({ status: 401 })
    const r = await requireUser(req('Bearer x'), { makeUserClient: userClient({ user: { id: 'u' }, isAdmin: false }) })
    expect(r).toMatchObject({ user: { id: 'u' }, isAdmin: false })
  })
})

const A = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const U2 = '33333333-3333-4333-8333-333333333333'
const G = '44444444-4444-4444-8444-444444444444'
function fakeDb({ existing = null, artwork, orderItem = null }) {
  const calls = { rpc: [] }
  const query = (table) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: orderItem ? [orderItem] : [], error: null }),
      maybeSingle: async () => ({ data: table === 'certificates' ? db.state.existing : table === 'profiles' ? { id: U, full_name: 'Ana Coleccionista', email: 'ANA@x.com' } : artwork, error: null }) }
    return q
  }
  const db = {
    calls,
    from: query,
    rpc: async (name, args) => {
      calls.rpc.push({ name, ...args })
      const cert = { id: `c${calls.rpc.length}`, status: 'ISSUED', owner_id: args._owner_id, data_hash: args._data_hash, issued_at: args._issued_at, certificate_number: args._certificate_number, claim_source: args._source, version: args._reissue ? 2 : 1, owner_email_snapshot: args._trace.owner_email }
      db.state.existing = cert
      return { data: { created: true, certificate: cert }, error: null }
    },
    state: { existing },
  }
  return db
}
const artwork = { id: A, sku: 'deco-10', title: 'Urban Totem N° 01', year: 2026, pending_owner_id: U, ownership_status: 'CLAIM_PENDING' }
const noPdf = async ({ certificate }) => ({ ...certificate, pdf_hash: 'f'.repeat(64), pdf_storage_path: `${certificate.id}/coa-v1.pdf` })

describe('central certificate issuance', () => {
  test('detail claim: approval creates one certificate with DETAIL_CLAIM source and PDF', async () => {
    const db = fakeDb({ artwork: { ...artwork, pending_claim_source: 'DETAIL_CLAIM' } })
    const r = await issueCertificate({ db, artworkId: A, ownerId: U, adminId: 'admin', generatePdf: noPdf, now: () => new Date('2026-10-22T17:00:00Z') })
    expect(r.created).toBe(true)
    expect(db.calls.rpc[0].name).toBe('issue_certificate_v2')
    expect(db.calls.rpc[0]._source).toBe('DETAIL_CLAIM')
    expect(r.certificate.data_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(r.pdf.ready).toBe(true)
  })
  test('batch claim: source and claim group come from the pending claim', async () => {
    const db = fakeDb({ artwork: { ...artwork, pending_claim_source: 'BATCH_CLAIM', pending_claim_group_id: G } })
    await issueCertificate({ db, artworkId: A, ownerId: U, generatePdf: noPdf })
    expect(db.calls.rpc[0]._source).toBe('BATCH_CLAIM')
    expect(db.calls.rpc[0]._trace.claim_group_id).toBe(G)
  })
  test('order references are recorded when a sale exists', async () => {
    const db = fakeDb({ artwork, orderItem: { id: 'oi1', order_id: 'o1', claim_group_id: null } })
    await issueCertificate({ db, artworkId: A, ownerId: U, generatePdf: noPdf })
    expect(db.calls.rpc[0]._trace).toMatchObject({ order_id: 'o1', order_item_id: 'oi1' })
  })
  test('double approve returns the same certificate without a second RPC', async () => {
    const db = fakeDb({ artwork })
    const first = await issueCertificate({ db, artworkId: A, ownerId: U, generatePdf: noPdf })
    const second = await issueCertificate({ db, artworkId: A, ownerId: U, generatePdf: noPdf })
    expect(second.created).toBe(false)
    expect(second.certificate.data_hash).toBe(first.certificate.data_hash)
    expect(db.calls.rpc.length).toBe(1)
  })
  test('claim owner different from claimant is rejected', async () => {
    const db = fakeDb({ artwork })
    await expect(issueCertificate({ db, artworkId: A, ownerId: U2, generatePdf: noPdf })).rejects.toMatchObject({ status: 409, code: 'owner_mismatch' })
    expect(db.calls.rpc.length).toBe(0)
  })
  test('admin manual with existing collector freezes the profile name/email snapshot', async () => {
    const db = fakeDb({ artwork: { ...artwork, pending_owner_id: null, ownership_status: 'SOLD' } })
    await issueCertificate({ db, artworkId: A, ownerId: U, source: 'ADMIN_MANUAL', issuedBy: 'admin', generatePdf: noPdf })
    expect(db.calls.rpc[0]).toMatchObject({ _source: 'ADMIN_MANUAL', _owner_id: U, _issued_by: 'admin' })
    expect(db.calls.rpc[0]._trace).toMatchObject({ owner_name: 'Ana Coleccionista', owner_email: 'ana@x.com' })
  })
  test('admin manual without account: owner_id null, name/email snapshot, no user created', async () => {
    const db = fakeDb({ artwork: { ...artwork, pending_owner_id: null, ownership_status: 'SOLD' } })
    await issueCertificate({ db, artworkId: A, source: 'ADMIN_MANUAL', ownerName: 'Luis Pérez', ownerEmail: 'Luis@Example.com', generatePdf: noPdf })
    expect(db.calls.rpc[0]._owner_id).toBe(null)
    expect(db.calls.rpc[0]._trace).toMatchObject({ owner_name: 'Luis Pérez', owner_email: 'luis@example.com' })
  })
  test('admin manual without valid collector data is rejected', async () => {
    const db = fakeDb({ artwork })
    await expect(issueCertificate({ db, artworkId: A, source: 'ADMIN_MANUAL', ownerName: 'X', ownerEmail: 'bad', generatePdf: noPdf })).rejects.toMatchObject({ status: 400, code: 'owner_required' })
  })
  test('admin issuing twice for the same collector is idempotent', async () => {
    const db = fakeDb({ artwork: { ...artwork, pending_owner_id: null } })
    await issueCertificate({ db, artworkId: A, ownerId: U, source: 'ADMIN_MANUAL', generatePdf: noPdf })
    const again = await issueCertificate({ db, artworkId: A, ownerId: U, source: 'ADMIN_MANUAL', generatePdf: noPdf })
    expect(again.created).toBe(false)
    expect(db.calls.rpc.length).toBe(1)
  })
  test('admin cannot silently assign a different collector over an active certificate', async () => {
    const db = fakeDb({ artwork, existing: { id: 'c0', status: 'ISSUED', owner_id: U, version: 1 } })
    await expect(issueCertificate({ db, artworkId: A, ownerId: U2, source: 'ADMIN_MANUAL', generatePdf: noPdf })).rejects.toMatchObject({ status: 409, code: 'active_certificate_exists' })
  })
  test('reissue creates version 2 with new number and references the previous version', async () => {
    const db = fakeDb({ artwork, existing: { id: 'c0', status: 'ISSUED', owner_id: U, version: 1 } })
    await issueCertificate({ db, artworkId: A, ownerId: U2, source: 'ADMIN_MANUAL', reissue: true, confirmOverride: true, reason: 'Corrección', generatePdf: noPdf })
    expect(db.calls.rpc[0]).toMatchObject({ _reissue: true, _certificate_number: 'COA-DECO-10-V2' })
    expect(db.calls.rpc[0]._trace.expected_previous_id).toBe('c0')
  })
  test('certificate stays issued when PDF generation is pending (e.g. signature missing)', async () => {
    const db = fakeDb({ artwork })
    const failing = async () => { const e = new Error('x'); e.code = 'signature_missing'; throw e }
    const r = await issueCertificate({ db, artworkId: A, ownerId: U, generatePdf: failing })
    expect(r.created).toBe(true)
    expect(r.pdf).toMatchObject({ ready: false, error: 'signature_missing' })
  })
  test('linked artist without full_name prevents issuance before RPC', async () => {
    const db = fakeDb({ artwork: { ...artwork, artist_profile_id: A, artist_profile: null } })
    await expect(issueCertificate({ db, artworkId: A, ownerId: U, generatePdf: noPdf })).rejects.toMatchObject({ status: 409, code: 'artist_profile_name_missing' })
    expect(db.calls.rpc.length).toBe(0)
  })
  test('invalid ids rejected before database', async () => {
    await expect(issueCertificate({ db: fakeDb({ artwork }), artworkId: 'x', ownerId: U })).rejects.toMatchObject({ status: 400 })
  })
})
