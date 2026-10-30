import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultCurrency, convertFromMxn, formatMoney, displayPrice } from './currency.js'
import { inchesFromCmText } from './dimensions.js'
import { artworkJsonLd } from './seo.js'

test('español usa MXN e inglés USD por defecto', () => {
  assert.equal(defaultCurrency('es', null), 'MXN')
  assert.equal(defaultCurrency('en', null), 'USD')
})

test('una elección manual nunca se sobrescribe por el idioma', () => {
  assert.equal(defaultCurrency('en', 'MXN'), 'MXN')
  assert.equal(defaultCurrency('es', 'USD'), 'USD')
})

test('formato sin decimales innecesarios', () => {
  assert.equal(formatMoney(18900, 'MXN', 'es-MX'), '$18,900 MXN')
  assert.equal(formatMoney(1050, 'USD', 'en-US'), '$1,050 USD')
})

test('USD se calcula desde MXN con la tasa compartida', () => {
  assert.equal(Math.round(convertFromMxn(18900, 'USD', 0.0556)), 1051)
})

test('sin tasa válida se muestra MXN, que es lo que se cobra', () => {
  const p = displayPrice(18900, 'USD', null, 'en-US')
  assert.equal(p.text, '$18,900 MXN')
  assert.equal(p.approximate, false)
})

test('USD aproximado activa el aviso de tipo de cambio; MXN no', () => {
  assert.equal(displayPrice(18900, 'USD', 0.05, 'en-US').approximate, true)
  assert.equal(displayPrice(18900, 'MXN', 0.05, 'es-MX').approximate, false)
})

test('cm a pulgadas: 85 × 55 cm → 33.5 × 21.7 in', () => {
  assert.equal(inchesFromCmText('85 × 55 cm'), '33.5 × 21.7 in')
  assert.equal(inchesFromCmText('185 x 125 cm'), '72.8 × 49.2 in')
})

test('dimensiones que no están en cm no se convierten', () => {
  assert.equal(inchesFromCmText('13 × 19 in'), null)
  assert.equal(inchesFromCmText('Variable'), null)
})

const base = { sku: 'JBU-1', title: 'T', status: 'AVAILABLE', availability_status: 'AVAILABLE', base_price_mxn: 18900 }
test('JSON-LD incluye Offer en MXN cuando el precio es visible', () => {
  const offer = artworkJsonLd(base)[0].offers
  assert.equal(offer?.price, 18900)
  assert.equal(offer?.priceCurrency, 'MXN')
})

test('JSON-LD sin precio si es «Consultar precio» o vendida', () => {
  assert.equal(artworkJsonLd({ ...base, price_display_mode: 'CONTACT_FOR_PRICE' })[0].offers, undefined)
  assert.equal(artworkJsonLd({ ...base, availability_status: 'SOLD' })[0].offers, undefined)
})
