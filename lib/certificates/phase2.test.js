import { describe, test, expect } from 'bun:test'
import { certificateDataHash, buildSnapshot } from './canonicalize.js'
import { verifyCertificateData } from './integrity.server.js'
import { certificateClaimState, batchItemState, publicCertificate, certificateVerifyUrl } from './public.js'
import { ensureCertificatePdf, renderCertificatePdf, sha256Hex, verifyStoredPdf } from './pdf.server.js'
import { presentBatchItem, claimBatch } from './batchClaim.server.js'

const artwork = { id: 'a1', sku: 'deco-10', title: 'Urban Totem N° 01', year: 2026, technique: 'Óleo', dimensions: '200 × 145 cm', primary_image_url: 'https://x/img.jpg', price: 50000 }
function certFrom(art, extra = {}) {
  const snapshot = buildSnapshot({ ...art, artist: 'Josué Beltrán Uresti' })
  const base = { id: 'c1', artwork_id: art.id, owner_id: 'u1', certificate_number: 'COA-DECO-10', issued_at: '2026-10-22T17:00:00.000Z', status: 'ISSUED', version: 1, canonical_version: 'jbu-coa-v1', ...snapshot, ...extra }
  base.data_hash = certificateDataHash({ certificateNumber: base.certificate_number, artworkId: base.artwork_id, ownerId: base.owner_id, issuedAt: base.issued_at, snapshot })
  return base
}

describe('snapshot immutability and data integrity', () => {
  test('editing the artwork after issuance does not change the certificate or its integrity', () => {
    const live = { ...artwork }
    const cert = certFrom(live)
    live.title = 'Título editado'; live.technique = 'Acrílico'; live.primary_image_url = 'https://x/new.jpg'; live.price = 1
    expect(cert.title).toBe('Urban Totem N° 01')
    expect(verifyCertificateData(cert)).toBe(true)
  })
  test('tampered snapshot fails data integrity', () => {
    expect(verifyCertificateData({ ...certFrom(artwork), title: 'Otra obra' })).toBe(false)
  })
})

describe('claim states', () => {
  test('admin states', () => {
    expect(certificateClaimState({ artwork: { ownership_status: 'SOLD' }, certificate: null })).toBe('NOT_CLAIMED')
    expect(certificateClaimState({ artwork: { ownership_status: 'CLAIM_PENDING' }, certificate: null })).toBe('CLAIM_PENDING')
    expect(certificateClaimState({ artwork: {}, certificate: { status: 'ISSUED', claim_source: 'BATCH_CLAIM' } })).toBe('VERIFIED')
    expect(certificateClaimState({ artwork: {}, certificate: { status: 'ISSUED', claim_source: 'ADMIN_MANUAL' } })).toBe('MANUALLY_ASSIGNED')
  })
  test('batch item states block duplicate claims', () => {
    expect(batchItemState({ artwork: { ownership_status: 'SOLD' }, item: {} })).toBe('AVAILABLE')
    expect(batchItemState({ artwork: { ownership_status: 'CLAIM_PENDING' }, item: {} })).toBe('CLAIM_PENDING')
    expect(batchItemState({ artwork: { ownership_status: 'SOLD' }, certificate: { status: 'ISSUED' }, item: {} })).toBe('VERIFIED')
  })
})

describe('public privacy', () => {
  test('verify projection never exposes collector, internal ids, orders or tokens', () => {
    const pub = publicCertificate(certFrom(artwork, { owner_name_snapshot: 'Ana', owner_email_snapshot: 'ana@x.com', order_id: 'o1', claim_group_id: 'g1', issued_by: 'admin', pdf_storage_path: 'c1/coa-v1.pdf', pdf_hash: 'f'.repeat(64) }))
    for (const k of ['owner_id', 'owner_name_snapshot', 'owner_email_snapshot', 'order_id', 'order_item_id', 'claim_group_id', 'issued_by', 'artwork_id', 'id', 'pdf_storage_path', 'price'])
      expect(pub[k]).toBeUndefined()
    expect(pub).toMatchObject({ registered_collection: true, has_pdf: true, title: 'Urban Totem N° 01' })
  })
  test('batch presentation carries no price fields', () => {
    const view = presentBatchItem({ item: { id: 'i1', unit_price_mxn: 9000, is_claimed: false }, artwork: { ...artwork, ownership_status: 'SOLD' }, certificate: null })
    expect(Object.keys(view).sort()).toEqual(['artist', 'id', 'image', 'sku', 'state', 'title', 'year'])
    expect(JSON.stringify(view)).not.toContain('9000')
  })
  test('verify URL is canonical www', () => {
    expect(certificateVerifyUrl('deco-10')).toBe('https://www.josuebeltranuresti.com/verify/deco-10')
  })
})

// PNG 1×1 válido para firma/QR e imagen.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
function storageDb() {
  const files = new Map(); const rpc = []
  return {
    files, rpc,
    storage: { from: () => ({
      upload: async (path, bytes) => { if (files.has(path)) return { error: { message: 'exists' } }; files.set(path, Buffer.from(bytes)); return { error: null } },
      download: async (path) => (files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { data: null, error: { message: 'nf' } }),
    }) },
    rpc: async (name, args) => { rpc.push({ name, ...args }); return { data: { certificate: { id: args._certificate_id, pdf_storage_path: args._path, pdf_hash: args._pdf_hash } }, error: null } },
  }
}

describe('official PDF', () => {
  const deps = { loadImage: async () => PNG, loadSig: async () => PNG, makeQr: async () => PNG }
  test('PDF is stored once; pdf_hash equals SHA-256 of the stored file', async () => {
    const db = storageDb(); const cert = certFrom(artwork)
    const updated = await ensureCertificatePdf({ db, certificate: cert, ...deps })
    const stored = db.files.get('c1/coa-v1.pdf')
    expect(stored.subarray(0, 5).toString()).toBe('%PDF-')
    expect(updated.pdf_hash).toBe(sha256Hex(stored))
    expect(await verifyStoredPdf(db, { ...cert, ...updated })).toBe(true)
  })
  test('existing PDF is never regenerated', async () => {
    const db = storageDb(); let renders = 0
    const cert = { ...certFrom(artwork), pdf_hash: 'a'.repeat(64), pdf_storage_path: 'c1/coa-v1.pdf' }
    await ensureCertificatePdf({ db, certificate: cert, ...deps, render: async () => { renders++; return Buffer.from('x') } })
    expect(renders).toBe(0)
  })
  test('concurrent upload: hash corresponds to the file already stored', async () => {
    const db = storageDb(); const cert = certFrom(artwork)
    db.files.set('c1/coa-v1.pdf', Buffer.from('%PDF-winner'))
    const updated = await ensureCertificatePdf({ db, certificate: cert, ...deps })
    expect(updated.pdf_hash).toBe(sha256Hex(Buffer.from('%PDF-winner')))
  })
  test('missing signature blocks the PDF (never generated)', async () => {
    const db = storageDb()
    await expect(ensureCertificatePdf({ db, certificate: certFrom(artwork), ...deps, loadSig: async () => { const e = new Error('s'); e.code = 'signature_missing'; throw e } })).rejects.toMatchObject({ code: 'signature_missing' })
    expect(db.files.size).toBe(0)
  })
  test('PDF content has no prices', async () => {
    const bytes = await renderCertificatePdf(certFrom(artwork), { image: PNG, signature: PNG, qr: PNG })
    expect(bytes.toString('latin1')).not.toMatch(/MXN|\$\s?\d|50000/)
  })
})

describe('batch claim', () => {
  function batchDb({ artworks }) {
    const updates = []
    const chain = (table, result) => {
      const q = { select: () => q, eq: () => q, in: () => q, is: () => q, not: () => q, order: () => q,
        maybeSingle: async () => ({ data: { id: 'g1', buyer_name: 'Ana' }, error: null }),
        update: (v) => { updates.push({ table, v }); q._update = true; return q },
        then: (res) => res(result(q)) }
      return q
    }
    return {
      updates,
      from: (table) => chain(table, (q) => {
        if (q._update) return { data: table === 'artworks' ? [{ id: 'x' }] : null, error: null }
        if (table === 'order_items') return { data: artworks.map((a, i) => ({ id: `i${i}`, artwork_id: a.id, is_claimed: false })), error: null }
        if (table === 'artworks') return { data: artworks, error: null }
        return { data: [], error: null }
      }),
      rpc: async () => ({ data: null, error: null }),
    }
  }
  test('each artwork gets its own pending claim with BATCH_CLAIM and shared group; claimed ones are skipped', async () => {
    const db = batchDb({ artworks: [{ id: 'a1', ownership_status: 'SOLD' }, { id: 'a2', ownership_status: 'VERIFIED' }] })
    const { results } = await claimBatch(db, { token: 't', userId: 'u1', itemIds: ['i0', 'i1'] })
    expect(results).toEqual([{ id: 'i0', status: 'claimed', state: 'CLAIM_PENDING' }, { id: 'i1', status: 'skipped', state: 'VERIFIED' }])
    const artUpdate = db.updates.find((u) => u.table === 'artworks').v
    expect(artUpdate).toMatchObject({ pending_owner_id: 'u1', ownership_status: 'CLAIM_PENDING', pending_claim_source: 'BATCH_CLAIM', pending_claim_group_id: 'g1' })
  })
  test('items outside the group are rejected', async () => {
    const db = batchDb({ artworks: [{ id: 'a1', ownership_status: 'SOLD' }] })
    await expect(claimBatch(db, { token: 't', userId: 'u1', itemIds: ['zz'] })).rejects.toMatchObject({ status: 400 })
  })
})
