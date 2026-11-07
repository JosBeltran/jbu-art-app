import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firstFlaggedPrintImage, variantImage, resolvePrintImage } from './printImages.js'

const available = { id:'art-1', primary_image_url:'original.jpg', availability_status:'AVAILABLE' }
const sold = { ...available, availability_status:'SOLD' }
const gallery = [
  { id:'a', image_url:'not-for-print.jpg', display_order:0, is_print_image:false },
  { id:'b', image_url:'second.jpg', display_order:8, is_print_image:true, media_type:'image' },
  { id:'c', image_url:'first.jpg', display_order:2, is_print_image:true, media_type:'image' },
  { id:'d', image_url:'video.mp4', display_order:1, is_print_image:true, media_type:'video' },
]
const print = { id:'print-a3', price:1200, is_active:true, is_available:true, edition_type:'OPEN', resolved_print_image_url:'a3.jpg' }

test('flags honor stable gallery display_order and ignore video', () => {
  assert.equal(firstFlaggedPrintImage(gallery), 'first.jpg')
})
test('available original remains the general catalog image', () => {
  assert.equal(resolvePrintImage({ artwork:available, gallery, variants:[print], context:'general' }), 'original.jpg')
})
test('sold artwork with available prints uses the first flagged image', () => {
  assert.equal(resolvePrintImage({ artwork:sold, gallery, variants:[print], context:'general' }), 'first.jpg')
})
test('sold artwork with no purchasable prints shows its original', () => {
  assert.equal(resolvePrintImage({ artwork:sold, gallery, variants:[], context:'general' }), 'original.jpg')
  assert.equal(resolvePrintImage({ artwork:sold, gallery, variants:[{...print,is_active:false}], context:'general' }), 'original.jpg')
})
test('print browsing always chooses print imagery, regardless of original availability', () => {
  for (const artwork of [available, sold])
    assert.equal(resolvePrintImage({ artwork, gallery, variants:[print], context:'prints' }), 'first.jpg')
})
test('no flagged image falls back to variant assignment', () => {
  assert.equal(resolvePrintImage({ artwork:sold, gallery:[], variants:[print], context:'general' }), 'a3.jpg')
  assert.equal(resolvePrintImage({ artwork:available, gallery:[], variants:[print], context:'prints' }), 'a3.jpg')
})
test('if no print-specific image exists, use original', () => {
  assert.equal(resolvePrintImage({ artwork:sold, gallery:[], variants:[{...print,resolved_print_image_url:null}], context:'prints' }), 'original.jpg')
})
test('a selected A3 print retains its own image instead of first flagged image', () => {
  assert.equal(variantImage(print, 'original.jpg', gallery), 'a3.jpg')
})
test('deleted image assignment falls back to flagged image or original', () => {
  assert.equal(variantImage({...print,resolved_print_image_url:null}, 'original.jpg', gallery), 'first.jpg')
  assert.equal(variantImage({...print,resolved_print_image_url:null}, 'original.jpg', []), 'original.jpg')
})
test('limited editions that are sold out are not eligible', () => {
  const soldOut = {...print, edition_type:'LIMITED', edition_size:10, prints_sold:10}
  assert.equal(resolvePrintImage({ artwork:sold, gallery, variants:[soldOut], context:'prints' }), 'original.jpg')
})
