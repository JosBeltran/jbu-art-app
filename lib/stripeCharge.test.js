import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chargeFor, displayTotal } from './currency.js'
import { mxnFulfillment, pendingMxnAmount, sessionCharge } from './stripeCharge.js'

const rate = 0.0556
const usdSession = (extra) => ({ currency: 'usd', ...extra, metadata: { charge_currency: 'USD', fx_usd_per_mxn: String(rate), ...(extra.metadata || {}) } })

test('USD se cobra en dólares enteros, igual que se muestra', () => {
  assert.deepEqual(chargeFor(18900, 'USD', rate), { currency: 'USD', cents: 105100 })
  assert.deepEqual(chargeFor(18900, 'MXN', rate), { currency: 'MXN', cents: 1890000 })
})

test('sin tasa se cobra MXN', () => {
  assert.equal(chargeFor(18900, 'USD', null).currency, 'MXN')
})

test('el total del carrito en USD es la suma exacta de lo cobrado por partida', () => {
  const t = displayTotal([{ price: 18900, quantity: 1 }, { price: 5000, quantity: 2 }], 'USD', rate, 'en-US')
  assert.equal(t.text, '$1,607 USD')
})

test('MXN conserva el contrato actual del webhook', () => {
  const r = mxnFulfillment({ currency: 'mxn', amount_total: 1890000, metadata: {} }, [{ amount_total: 1890000, amount_subtotal: 1890000, quantity: 1 }])
  assert.deepEqual(r.units, [18900]); assert.equal(r.total, 18900)
})

test('USD reconstruye el precio MXN original por línea', () => {
  const s = usdSession({ amount_total: 105100, metadata: { mxn_units: '[18900]' } })
  const r = mxnFulfillment(s, [{ amount_total: 105100, amount_subtotal: 105100, quantity: 1 }])
  assert.deepEqual(r.units, [18900]); assert.equal(r.total, 18900)
})

test('USD con 10% de bienvenida aplica el descuento al MXN', () => {
  const s = usdSession({ amount_total: 94590, metadata: { mxn_units: '[18900]' } })
  const r = mxnFulfillment(s, [{ amount_total: 94590, amount_subtotal: 105100, quantity: 1 }])
  assert.equal(r.total, 17010)
})

test('USD con importe distinto al esperado se rechaza', () => {
  const s = usdSession({ amount_total: 100000, metadata: { mxn_units: '[18900]' } })
  assert.throws(() => mxnFulfillment(s, [{ amount_total: 100000, amount_subtotal: 100000, quantity: 1 }]), /amount_mismatch/)
})

test('USD sin tasa registrada o moneda desconocida se rechaza', () => {
  assert.throws(() => sessionCharge({ currency: 'usd', metadata: {} }), /fx_missing/)
  assert.throws(() => sessionCharge({ currency: 'eur', metadata: {} }), /currency_mismatch/)
})

test('pago pendiente en USD devuelve el monto MXN aceptado', () => {
  const s = usdSession({ amount_total: 105100, metadata: { offer_amount: '18900' } })
  assert.equal(pendingMxnAmount(s).amount, 18900)
  assert.throws(() => pendingMxnAmount({ ...s, amount_total: 105000 }), /amount_mismatch/)
})
