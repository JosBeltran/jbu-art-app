import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validatePaidOpenPrintLines } from './guestPrintPayment.js'
import { chargeFor } from './currency.js'

const item = { quantity: 2, unit_mxn: 1200, artwork_id: 'a', variant_id: 'v' }
const line = { quantity: 2, amount_total: 240000, amount_subtotal: 240000 }
const mxn = { currency: 'mxn', usdPerMxn: null }

test('Stripe paid MXN amount and quantities match frozen server snapshots', () => {
  assert.deepEqual(validatePaidOpenPrintLines([item],[line],mxn,240000),
    {totalMxn:2400,currency:'MXN',paidTotalCents:240000})
})

test('USD is converted using locked server FX; no client price is accepted', () => {
  const charge = { currency: 'usd', usdPerMxn: 0.05 }
  const cents = chargeFor(1200,'USD',0.05).cents * 2
  assert.deepEqual(validatePaidOpenPrintLines([item],[{quantity:2,amount_total:cents,amount_subtotal:cents}],charge,cents),
    {totalMxn:2400,currency:'USD',paidTotalCents:cents})
})

test('fails Stripe mismatched line price, discount or manipulated paid total', () => {
  assert.throws(()=>validatePaidOpenPrintLines([item],[{...line,amount_total:100}],mxn,100),/print_line_price_invalid/)
  assert.throws(()=>validatePaidOpenPrintLines([item],[{...line,amount_subtotal:200000}],mxn,240000),/print_line_price_invalid/)
  assert.throws(()=>validatePaidOpenPrintLines([item],[line],mxn,1),/print_paid_total_invalid/)
})

test('a cancelled or unpaid session cannot be inferred as paid from line validation alone', () => {
  // Payment-status verification is performed *before* invoking this helper in
  // the signed webhook handler, which ignores non-paid sessions.
  assert.equal(validatePaidOpenPrintLines([item],[line],mxn,240000).totalMxn,2400)
})

test('does not accept unexpected extra items or wrong quantities', () => {
  assert.throws(()=>validatePaidOpenPrintLines([item],[line,line],mxn,240000),/print_lines_mismatch/)
  assert.throws(()=>validatePaidOpenPrintLines([item],[{...line,quantity:3}],mxn,240000),/print_line_quantity_invalid/)
})

test('rejects unsupported currencies and invalid USD FX', () => {
  assert.throws(()=>validatePaidOpenPrintLines([item],[line],{currency:'eur'},240000),/print_charge_currency_invalid/)
  assert.throws(()=>validatePaidOpenPrintLines([item],[line],{currency:'usd',usdPerMxn:null},240000),/print_charge_currency_invalid/)
})
