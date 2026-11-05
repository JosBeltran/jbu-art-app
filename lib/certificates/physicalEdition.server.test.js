import { test } from 'node:test'
import assert from 'node:assert/strict'
import { issuePhysicalEditionCertificate } from './physicalEdition.server.js'

const buyer = '12345678-1234-4234-8234-123456789012'
const artworkId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const unitId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const itemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const orderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function fakeDb({ orderStatus = 'DELIVERED', paid = true, orderBuyer = buyer, unitStatus = 'SOLD' } = {}) {
  const rows = {
    order_items: { id: itemId, artwork_id: artworkId, order_id: orderId, physical_edition_unit_id: unitId },
    orders: { id: orderId, buyer_user_id: orderBuyer, status: orderStatus, payment_status: paid ? 'PAID' : 'PENDING' },
    artwork_edition_units: { id: unitId, artwork_id: artworkId, edition_number: 13, order_item_id: itemId, status: unitStatus, unit_identifier: 'epoxy-01-013' },
    artworks: {
      id: artworkId, title: 'The Artwork', sku: 'epoxy-01', artist: 'Estudio JBU',
      year: 2026, medium: 'Resin on wood', dimensions: '40x50 cm',
      physical_edition_type: 'LIMITED_EDITION', physical_edition_size: 50,
      primary_image_url: 'https://example.com/placeholder.jpg',
    },
  }
  const calls = []
  return {
    calls,
    from: table => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }),
      }),
    }),
    rpc: async (name, params) => {
      calls.push({ name, params })
      return {
        data: {
          created: false,
          certificate: {
            id: 'eee', sku: 'epoxy-01-013', certificate_number: 'COA-EPOXY-01-013',
            pdf_hash: 'a'.repeat(64), pdf_storage_path: 'eee/coa-v1.pdf',
          },
        },
        error: null,
      }
    },
  }
}

test('cannot claim a numbered unit belonging to another buyer', async () => {
  const db = fakeDb({ orderBuyer: '22222222-2222-4222-8222-222222222222' })
  await assert.rejects(
    issuePhysicalEditionCertificate({ db, orderItemId: itemId, buyerId: buyer }),
    err => err.status === 403 && err.code === 'forbidden',
  )
  assert.equal(db.calls.length, 0)
})

test('requires a paid and delivered order', async () => {
  for (const options of [{ paid: false }, { orderStatus: 'SHIPPED' }, { unitStatus: 'AVAILABLE' }]) {
    const db = fakeDb(options)
    await assert.rejects(issuePhysicalEditionCertificate({ db, orderItemId: itemId, buyerId: buyer }))
    assert.equal(db.calls.length, 0)
  }
})

test('issues stable SKU and 013/050 snapshot for a sold physical unit', async () => {
  const db = fakeDb()
  const result = await issuePhysicalEditionCertificate({
    db, orderItemId: itemId, buyerId: buyer,
    now: () => new Date('2026-11-04T12:00:00.000Z'),
  })
  assert.equal(result.pdfReady, true)
  assert.equal(db.calls.length, 1)
  assert.equal(db.calls[0].name, 'issue_physical_edition_certificate')
  assert.equal(db.calls[0].params._snapshot.sku, 'epoxy-01-013')
  assert.equal(db.calls[0].params._snapshot.edition, '013/050')
  assert.equal(db.calls[0].params._snapshot.edition_type, 'PHYSICAL_LIMITED_EDITION')
  assert.match(db.calls[0].params._data_hash, /^[0-9a-f]{64}$/)
})
