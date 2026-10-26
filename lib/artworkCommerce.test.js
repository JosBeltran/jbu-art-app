import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getArtworkCommercePresentation,
  getPriceDisplayMode,
  getArtworkPrice,
} from './artworkCommerce.js'

const base = {
  status: 'AVAILABLE',
  availability_status: 'AVAILABLE',
  ownership_status: 'AVAILABLE',
  base_price_mxn: 5000,
  calculated_price_mxn: 5000,
}

test('obra disponible con precio muestra precio y Add', () => {
  const p = getArtworkCommercePresentation(base)
  assert.equal(p.availability, 'AVAILABLE')
  assert.equal(p.priceMode, 'SHOW_PRICE')
  assert.equal(p.price, 5000)
  assert.equal(p.showPrice, true)
  assert.equal(p.showAdd, true)
  assert.equal(p.showInquiry, false)
  assert.equal(p.cta, 'ADD')
})

test('sin price_display_mode (migración pendiente) se comporta como SHOW_PRICE', () => {
  const legacy = { ...base }
  delete legacy.price_display_mode
  assert.equal(getPriceDisplayMode(legacy), 'SHOW_PRICE')
  assert.equal(getArtworkCommercePresentation(legacy).cta, 'ADD')
})

test('CONTACT_FOR_PRICE oculta precio y Add, muestra Consultar precio', () => {
  const p = getArtworkCommercePresentation({ ...base, price_display_mode: 'CONTACT_FOR_PRICE' })
  assert.equal(p.priceMode, 'CONTACT_FOR_PRICE')
  assert.equal(p.price, null)
  assert.equal(p.showPrice, false)
  assert.equal(p.showAdd, false)
  assert.equal(p.showInquiry, true)
  assert.equal(p.cta, 'ASK_PRICE')
})

test('SOLD nunca muestra Add ni Consultar precio', () => {
  const sold = { ...base, availability_status: 'SOLD', ownership_status: 'SOLD' }
  const p = getArtworkCommercePresentation(sold)
  assert.equal(p.cta, 'NONE')
  assert.equal(p.showAdd, false)
  assert.equal(p.showInquiry, false)
  assert.equal(p.showPrice, false)

  const soldContact = getArtworkCommercePresentation({ ...sold, price_display_mode: 'CONTACT_FOR_PRICE' })
  assert.equal(soldContact.cta, 'NONE')
  assert.equal(soldContact.showInquiry, false)
})

test('SOLD por ownership histórico (sin availability_status) tampoco muestra acciones', () => {
  const legacy = { status: 'OWNED', ownership_status: 'SOLD', base_price_mxn: 5000 }
  const p = getArtworkCommercePresentation(legacy)
  assert.equal(p.availability, 'SOLD')
  assert.equal(p.cta, 'NONE')
})

test('SHOW_PRICE sin precio válido no muestra Add', () => {
  const p = getArtworkCommercePresentation({ ...base, base_price_mxn: 0, calculated_price_mxn: 0 })
  assert.equal(p.price, null)
  assert.equal(p.showAdd, false)
  assert.equal(p.cta, 'NONE')
})

test('modo desconocido cae a SHOW_PRICE', () => {
  assert.equal(getPriceDisplayMode({ price_display_mode: 'OTRO' }), 'SHOW_PRICE')
  assert.equal(getPriceDisplayMode({ price_display_mode: null }), 'SHOW_PRICE')
})

test('getArtworkPrice prefiere calculated_price_mxn y rechaza valores inválidos', () => {
  assert.equal(getArtworkPrice({ calculated_price_mxn: 7500, base_price_mxn: 5000 }), 7500)
  assert.equal(getArtworkPrice({ base_price_mxn: 5000 }), 5000)
  assert.equal(getArtworkPrice({ base_price_mxn: -10 }), null)
  assert.equal(getArtworkPrice({}), null)
})

test('RESERVED no muestra Add ni Consultar precio', () => {
  const p = getArtworkCommercePresentation({ ...base, availability_status: 'RESERVED' })
  assert.equal(p.cta, 'NONE')
  assert.equal(p.showAdd, false)
  assert.equal(p.showInquiry, false)
})
