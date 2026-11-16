import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editionAvailability, editionDesignation, isPhysicalEdition, numberPhysicalEdition } from './physicalEdition.js'
import { catalogArtworkType, catalogQueryHref } from './catalogUrl.js'
import { getArtworkCommercePresentation } from './artworkCommerce.js'

test('unit counts distinguish stock states without relying on artwork ownership', () => {
  const checks = { edition_size: 20, available: 20, reserved: 0, sold: 0, sales_enabled: true }
  assert.equal(editionAvailability(checks), 'available')
  assert.equal(editionAvailability({ ...checks, available: 2, sold: 18 }), 'limited')
  assert.equal(editionAvailability({ ...checks, available: 0, reserved: 2, sold: 18 }), 'reserved')
  assert.equal(editionAvailability({ ...checks, sales_enabled: false }), 'paused')
  assert.equal(editionAvailability({ ...checks, sales_enabled: false, available: 0, sold: 20 }), 'sold-out')
  assert.equal(editionAvailability({ ...checks, available: 2 }), 'configuration')
  assert.equal(editionAvailability(null), 'configuration')
})

test('catalog type round-trips alongside country, series and search', () => {
  const start = 'country=GB&series=Devenir&q=canvas&sort=TITLE'
  const href = catalogQueryHref('/series/devenir', start, { artworkType: 'LIMITED_EDITION' })
  assert.equal(href, '/series/devenir?' + start + '&type=LIMITED_EDITION')
  assert.equal(catalogArtworkType('LIMITED_EDITION'), 'LIMITED_EDITION')
  assert.equal(catalogArtworkType('PRINT'), 'ALL')
  assert.equal(catalogQueryHref('/catalog', href.split('?')[1], { artworkType: 'ALL' }), '/catalog?' + start)
})

test('edition price matches its dedicated checkout and cannot enter the original cart', () => {
  const artwork = {
    physical_edition_type: 'LIMITED_EDITION', edition_type: 'OPEN',
    availability_status: 'AVAILABLE', base_price_mxn: 5000, calculated_price_mxn: 4000,
  }
  assert.equal(getArtworkCommercePresentation(artwork).price, 5000)
  assert.equal(getArtworkCommercePresentation(artwork).showAdd, false)
  assert.equal(getArtworkCommercePresentation({ ...artwork, physical_edition_type: 'UNIQUE' }).price, 4000)
  assert.equal(isPhysicalEdition({ edition_type: 'LIMITED' }), false)
  assert.equal(numberPhysicalEdition(3, 20), '003/020')
  assert.equal(editionDesignation(20, (_es, en) => en), 'Limited Edition of 20')
})
