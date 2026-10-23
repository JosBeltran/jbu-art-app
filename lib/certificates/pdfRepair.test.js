import { describe, test, expect } from 'bun:test'
import { ensureCertificatePdf, resolveStoredCertificatePdf, certificatePdfState, sha256Hex } from './pdf.server.js'
import { publicCertificate } from './public.js'

const baseCert = { id: 'c1', artwork_id: 'a1', sku: 'JBU-033', certificate_number: 'COA-JBU-033', status: 'ISSUED', version: 1, primary_image_url: 'https://x/img.jpg', issued_at: '2026-10-22T17:00:00.000Z' }

function storageDb(files = new Map()) {
  const calls = []
  return {
    files, calls,
    storage: { from: () => ({
      upload: async (path, bytes) => { if (files.has(path)) return { error: { message: 'exists' } }; files.set(path, Buffer.from(bytes)); return { error: null } },
      download: async (path) => (files.has(path) ? { data: new Blob([files.get(path)]), error: null } : { data: null, error: { message: 'nf' } }),
    }) },
    rpc: async (name, args) => { calls.push({ name, ...args }); return { data: { attached: true, conflict: false, certificate: { id: args._certificate_id, pdf_storage_path: args._path, pdf_hash: args._pdf_hash } }, error: null } },
  }
}

describe('certificatePdfState', () => {
  test('READY / METADATA_INCOMPLETE / MISSING', () => {
    expect(certificatePdfState(null)).toBe('MISSING')
    expect(certificatePdfState({})).toBe('MISSING')
    expect(certificatePdfState({ pdf_storage_path: 'c1/coa-v1.pdf' })).toBe('METADATA_INCOMPLETE')
    expect(certificatePdfState({ pdf_hash: 'a'.repeat(64) })).toBe('METADATA_INCOMPLETE')
    expect(certificatePdfState({ pdf_storage_path: 'c1/coa-v1.pdf', pdf_hash: 'a'.repeat(64) })).toBe('READY')
  })
})

describe('PDF repair adopts the existing stored file', () => {
  const noRender = {
    loadImage: async () => { throw new Error('no debe renderizar') },
    loadSig: async () => { throw new Error('no debe renderizar') },
    makeQr: async () => { throw new Error('no debe renderizar') },
    render: async () => { throw new Error('no debe renderizar') },
  }

  test('file at the deterministic path is adopted without rendering and metadata is completed', async () => {
    const db = storageDb(new Map([['c1/coa-v1.pdf', Buffer.from('%PDF-existing')]]))
    const updated = await ensureCertificatePdf({ db, certificate: { ...baseCert }, ...noRender })
    expect(updated.pdf_storage_path).toBe('c1/coa-v1.pdf')
    expect(updated.pdf_hash).toBe(sha256Hex(Buffer.from('%PDF-existing')))
    expect(db.calls[0]).toMatchObject({ name: 'attach_certificate_pdf', _certificate_id: 'c1', _path: 'c1/coa-v1.pdf' })
  })

  test('path already recorded but hash missing: hash is computed from the stored file', async () => {
    const db = storageDb(new Map([['c1/coa-v1.pdf', Buffer.from('%PDF-existing')]]))
    const resolved = await resolveStoredCertificatePdf(db, { ...baseCert, pdf_storage_path: 'c1/coa-v1.pdf' })
    expect(resolved.hash).toBe(sha256Hex(Buffer.from('%PDF-existing')))
  })

  test('a recorded hash that differs from the stored file is a conflict, never overwritten', async () => {
    const db = storageDb(new Map([['c1/coa-v1.pdf', Buffer.from('%PDF-existing')]]))
    await expect(resolveStoredCertificatePdf(db, { ...baseCert, pdf_hash: 'b'.repeat(64) })).rejects.toMatchObject({ code: 'pdf_hash_conflict' })
    expect(db.calls.length).toBe(0)
  })

  test('no file anywhere: returns null so the caller generates from the snapshot', async () => {
    const db = storageDb()
    expect(await resolveStoredCertificatePdf(db, { ...baseCert })).toBeNull()
  })

  test('complete metadata short-circuits without touching storage', async () => {
    const db = storageDb()
    const cert = { ...baseCert, pdf_storage_path: 'c1/coa-v1.pdf', pdf_hash: 'a'.repeat(64) }
    const resolved = await resolveStoredCertificatePdf(db, cert)
    expect(resolved.certificate).toBe(cert)
  })
})

describe('public download visibility', () => {
  test('has_pdf follows the stored file reference, not complete metadata', () => {
    expect(publicCertificate({ ...baseCert, pdf_storage_path: 'c1/coa-v1.pdf' }).has_pdf).toBe(true)
    expect(publicCertificate({ ...baseCert, pdf_hash: 'a'.repeat(64) }).has_pdf).toBe(true)
    expect(publicCertificate({ ...baseCert }).has_pdf).toBe(false)
  })
})

describe('collector group with three artworks (JBU-034, JBU-033, JBU-030)', () => {
  const certs = [
    { ...baseCert, id: 'c34', sku: 'JBU-034', certificate_number: 'COA-JBU-034', claim_group_id: 'g1' },
    { ...baseCert, id: 'c33', sku: 'JBU-033', certificate_number: 'COA-JBU-033', claim_group_id: 'g1', claim_source: 'ADMIN_MANUAL' },
    { ...baseCert, id: 'c30', sku: 'JBU-030', certificate_number: 'COA-JBU-030', claim_group_id: 'g1', claim_source: 'ADMIN_MANUAL' },
  ]
  const files = () => new Map(certs.map((c) => [`${c.id}/coa-v1.pdf`, Buffer.from(`%PDF-${c.sku}`)]))

  test('each artwork resolves its own stored PDF and shows its own download button', async () => {
    const db = storageDb(files())
    for (const c of certs) {
      const resolved = await resolveStoredCertificatePdf(db, { ...c })
      expect(resolved.path).toBe(`${c.id}/coa-v1.pdf`)
      expect(publicCertificate({ ...c, ...resolved.certificate }).has_pdf).toBe(true)
    }
  })

  test('if the metadata repair fails after the first artwork, the others still get their button', async () => {
    const db = storageDb(files())
    let n = 0
    const ok = db.rpc
    db.rpc = async (name, args) => (n++ === 0 ? ok(name, args) : { data: null, error: { message: 'duplicate provenance key' } })
    for (const c of certs) {
      const resolved = await resolveStoredCertificatePdf(db, { ...c })
      expect(resolved.path).toBe(`${c.id}/coa-v1.pdf`)
      expect(resolved.hash).toBe(sha256Hex(Buffer.from(`%PDF-${c.sku}`)))
      expect(publicCertificate({ ...c, ...resolved.certificate }).has_pdf).toBe(true)
    }
  })
})
