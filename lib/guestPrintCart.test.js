import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cartKey, normalizeGuestCart, guestOnlyAllowed, selectPrintRows } from './guestPrintCart.js'

const artwork = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const variant = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const print = (options = {}) => ({ type: 'PRINT', id: artwork, variantId: variant, quantity: 1, ...options })
const row = (options = {}) => ({ id: variant, artwork_id: artwork, edition_type: 'OPEN', price: 1500, is_active: true, size: '30 x 40 cm', finish: 'FINE_ART', ...options })

test('guest can add an Open Edition in a local cart', () => {
  assert.deepEqual(normalizeGuestCart([print()]), [{ type: 'PRINT', id: artwork, variantId: variant, quantity: 1 }])
  assert.equal(guestOnlyAllowed([print()], false), true)
})

test('guest cart survives JSON localStorage roundtrip', () => {
  const saved = JSON.stringify(normalizeGuestCart([print()]))
  assert.deepEqual(normalizeGuestCart(JSON.parse(saved)), normalizeGuestCart([print()]))
})

test('guest removes print by composite identity without removing other variant', () => {
  const a = print(), b = print({ variantId: other })
  assert.notEqual(cartKey(a), cartKey(b))
  assert.deepEqual([a,b].filter(i => cartKey(i) !== cartKey(a)), [b])
})

test('same print variant merges quantities; distinct variant remains separate', () => {
  const result = normalizeGuestCart([print(),print(),print({variantId:other})])
  assert.equal(result.length, 2)
  assert.equal(result[0].quantity,2)
})

test('original is not eligible for anonymous checkout', () => {
  assert.equal(guestOnlyAllowed([{type:'ORIGINAL',id:artwork}], false), false)
  assert.equal(guestOnlyAllowed([{type:'ORIGINAL',id:artwork},print()], false), false)
  assert.equal(guestOnlyAllowed([{type:'ORIGINAL',id:artwork},print()], true), true)
})

test('inactive print variant rejected', () => {
  assert.throws(() => selectPrintRows([row({is_active:false})],[print()]), /invalid_print_variant/)
})

test('unavailable print variant rejected even if is_active remains true', () => {
  assert.throws(() => selectPrintRows([row({is_active:true,is_available:false})], [print()]), /invalid_print_variant/)
})

test('missing print variant rejected', () => {
  assert.throws(() => selectPrintRows([], [print()]), /invalid_print_variant/)
})

test('wrong parent artwork rejected', () => {
  assert.throws(() => selectPrintRows([row({artwork_id:other})],[print()]), /invalid_print_variant/)
})

test('limited prints not eligible for guest open edition', () => {
  assert.throws(() => selectPrintRows([row({edition_type:'LIMITED'})],[print()]), /not_open_edition/)
})

test('database price is authoritative regardless of manipulated frontend price', () => {
  const [v] = selectPrintRows([row({price:875})],[print({price:1})])
  assert.equal(v.priceMxn,875)
})

test('invalid quantity is rejected (negative, fraction, excessive)', () => {
  for(const quantity of [-1,0,1.3,101])
    assert.throws(() => selectPrintRows([row()],[print({quantity})]), /invalid_print_quantity/)
})

test('registered and guest cart composite keys do not collide with original', () => {
  assert.notEqual(cartKey(print()),cartKey({type:'ORIGINAL',id:artwork}))
})

test('legacy print without variant id is not silently imported as open edition', () => {
  assert.equal(normalizeGuestCart([{type:'PRINT',id:artwork,quantity:1}]).length,0)
})

test('untrusted URLs or banking data are not stored in local cart', () => {
  const [v] = normalizeGuestCart([print({price:1, cardNumber:'secret', title:'bad', image:'evil'})])
  assert.deepEqual(Object.keys(v).sort(), ['id','quantity','type','variantId'].sort())
})
