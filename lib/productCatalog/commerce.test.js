import assert from 'node:assert/strict'
import test from 'node:test'
import { fineArtLineType, marketVariant,marketChoices, normalizeFineArtCart, verifiedFineArtLines } from './commerce.js'

const artwork = '10000000-0000-4000-8000-000000000001'
const variantId = '10000000-0000-4000-8000-000000000002'
const book = { id:'book',status:'active',country:'MX',currency:'MXN',channel:'storefront',priority:0 }
const entry = { id:'price',status:'active',price_book_id:'book',product_variant_id:variantId,amount_minor:42000 }
const variant = { id:variantId,countries:['MX','US'],priceBooks:[book],entries:[entry] }

test('the public chooser resolves its exact market and never substitutes currency, country or an ambiguous price',()=>{
  assert.equal(marketVariant(variant,'MX','MXN').amountMinor,42000)
  assert.equal(marketVariant(variant,'MX','USD'),null)
  assert.equal(marketVariant(variant,'US','MXN'),null)
  assert.equal(marketVariant({...variant,entries:[entry,{...entry,id:'other'}]},'MX','MXN'),null)
  assert.equal(marketVariant({...variant,entries:[{...entry,status:'draft'}]},'MX','MXN'),null)
})

test('the same persisted cart reconstructs a variant, market and quantity after navigation and authentication',()=>{
  const line = { id:artwork,variantId,type:fineArtLineType,quantity:2,currency:'MXN',destination:'MX',amountMinor:42000 }
  const saved = JSON.stringify([line,{...line,quantity:4}, {...line,variantId:'invalid'}, {...line,amountMinor:0}])
  assert.deepEqual(normalizeFineArtCart(JSON.parse(saved)),[{...line,quantity:4}])
})

test('paid Stripe line validation requires the configuration ID and exact merchandise subtotal',()=>{
  const line = { quantity:2,amount_total:84000,amount_subtotal:84000,currency:'mxn',
    price:{ product:{ metadata:{catalog_variant_id:variantId} } } }
  assert.deepEqual(verifiedFineArtLines([line],84000),{[variantId]:{quantity:2,subtotal:84000,currency:'mxn'}})
  assert.throws(()=>verifiedFineArtLines([line],85000),/fine_art_amount_mismatch/)
  assert.throws(()=>verifiedFineArtLines([line,line],168000),/fine_art_amount_mismatch/)
  assert.throws(()=>verifiedFineArtLines([{...line,price:{}}],84000),/fine_art_amount_mismatch/)
})

test('country changes expose only sellable exact variant choices without changing the selected cart identity',()=>{
  const first={id:'one',countries:['MX'],priceBooks:[book],entries:[{id:'entry',product_variant_id:'one',price_book_id:'book',status:'active',amount_minor:1000}]}
  const second={...first,id:'two',countries:['US'],entries:first.entries.map(row=>({...row,product_variant_id:'two'}))}
  assert.deepEqual(marketChoices([first,second],'MX','MXN').map(row=>row.id),['one'])
  const selected='one'
  assert.deepEqual(marketChoices([first,second],'US','MXN'),[])
  assert.equal(selected,'one')
})
