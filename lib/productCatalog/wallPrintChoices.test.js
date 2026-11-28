import assert from 'node:assert/strict'
import test from 'node:test'
import {customerPrintChoices} from './customerPrintConfiguration.js'
import {resolveWallPrintSpecification,wallPrintAffinity,wallPrintMatches,wallPrintSpecification} from './wallPrintChoices.js'

const makeVariant=(id,artworkId,size,widthMm,heightMm,market='MX')=>({
  id,artworkId,size,productFamily:'poster',series:'Devenir',
  attributes:[{code:'paper',value:'cotton'}],previewGeometry:{widthMm,heightMm,borderMm:0},
  presentationBorder:{unit:'none',value:0},countries:[market],
  priceBooks:[{id:'book',country:market,currency:market==='MX'?'MXN':'USD',status:'active',channel:'storefront'}],
  entries:[{id:'entry',product_variant_id:id,price_book_id:'book',amount_minor:5900,status:'active'}],
})
const active=makeVariant('a','A','A2',420,594)
const current=makeVariant('b','B','A3',297,420)
const match=makeVariant('c','B','A2',420,594)
const otherMarket=makeVariant('d','B','A2',420,594,'US')
const target=wallPrintSpecification(active)
const master={widthMm:420,heightMm:594,orientation:'portrait',borderMm:0}
const resolve=(options,masters,market='MX',currency='MXN')=>
  resolveWallPrintSpecification(options,current,target,active.previewGeometry,masters,market,currency)

test('applying an exact wall specification uses the active destination and currency',()=>{
  assert.deepEqual(resolve([otherMarket,match],[]),{variant:match})
  assert.deepEqual(resolve([otherMarket,match],[],'US','USD'),{variant:otherMarket})
  assert.deepEqual(resolve([otherMarket,match],[],'MX','USD'),{status:'missing'})
})

test('distinguishes master-ready, technical limits and an unavailable master lookup',()=>{
  assert.deepEqual(resolve([otherMarket],[master]),{status:'pending'})
  assert.deepEqual(resolve([otherMarket],[{...master,orientation:'landscape'}]),{status:'missing'})
  assert.deepEqual(resolve([otherMarket],[{...master,borderMm:5}]),{status:'missing'})
  assert.deepEqual(resolve([otherMarket],null),{status:'unknown'})
})

test('filters must match the same variant, including the no-frame and no-border values',()=>{
  assert.equal(wallPrintMatches(customerPrintChoices(match),target),true)
  assert.equal(wallPrintMatches(customerPrintChoices(current),target),false)
  assert.equal(wallPrintMatches(customerPrintChoices(match),{frame:'unframed',border:'0',size:''}),true)
  assert.equal(wallPrintMatches(customerPrintChoices(match),{orientation:'landscape'}),false)
})

test('ranking rewards versions in the same lineage and gives unrelated prints a fallback score',()=>{
  const seed={artworkId:'A',variant:active,geometry:active.previewGeometry}
  const lineage={A:'root',B:'root',C:'C'}
  const colors={A:[230,20,10],B:[180,40,10],C:[230,20,10]}
  const fallback={...match,artworkId:'C',series:'Orbitals'}
  assert.ok(wallPrintAffinity(match,seed,lineage,colors)>wallPrintAffinity(fallback,seed,lineage,colors))
  assert.ok(wallPrintAffinity(fallback,seed,lineage,colors)>0)
})
