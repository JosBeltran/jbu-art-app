import assert from 'node:assert/strict'
import test from 'node:test'
import {customerPrintChoices} from './customerPrintConfiguration.js'
import {resolveWallPrintSpecification,wallPrintAffinity,wallPrintMatches,wallPrintPage,wallPrintSpecification} from './wallPrintChoices.js'

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
const artworkPrint={size_code:'A2',orientation:'portrait',border_unit:'none',border_value:0,is_active:false}
const resolve=(options,artworkPrints,market='MX',currency='MXN')=>
  resolveWallPrintSpecification(options,current,target,active.previewGeometry,artworkPrints,market,currency)

test('applying an exact wall specification uses the active destination and currency',()=>{
  assert.deepEqual(resolve([otherMarket,match],[]),{variant:match})
  assert.deepEqual(resolve([otherMarket,match],[],'US','USD'),{variant:otherMarket})
  assert.deepEqual(resolve([otherMarket,match],[],'MX','USD'),{status:'missing'})
})

test('distinguishes a matching Artwork Print without a master, incompatible formats and a failed lookup',()=>{
  assert.deepEqual(resolve([otherMarket],[artworkPrint]),{status:'pending'})
  assert.deepEqual(resolve([otherMarket],[{...artworkPrint,size_code:'A1'}]),{status:'missing'})
  assert.deepEqual(resolve([otherMarket],[{...artworkPrint,orientation:'landscape'}]),{status:'missing'})
  assert.deepEqual(resolve([otherMarket],[{...artworkPrint,border_unit:'mm',border_value:5}]),{status:'missing'})
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

test('market availability and series ID take priority before slicing, and free filters search later works',()=>{
  const reference={artworkId:'seed',series:'Devenir',seriesId:'series-1'}
  const same={...makeVariant('same','z','A2',420,594),series:'Nombre anterior',seriesId:'series-1'}
  const unavailable={...makeVariant('us','b','A2',420,594,'US'),seriesId:'series-1'}
  const general=Array.from({length:8},(_,i)=>({...makeVariant(`print-${i}`,`c-${i}`,'A3',297,420),series:'Otra'}))
  const later={...makeVariant('later','y','A1',594,841),series:'Otra'}
  const catalog=[unavailable,...general,later,same].map(variant=>[variant])
  const query={reference,referenceId:'seed',country:'MX',currency:'MXN',offset:0,searchParams:new URLSearchParams()}
  const first=wallPrintPage(catalog,query)
  assert.equal(first.related[0][0].id,'same')
  assert.equal(first.nextOffset,6)
  assert.ok(first.facets.size.includes('A1'))
  const more=wallPrintPage(catalog,{...query,offset:first.nextOffset})
  assert.ok(more.related.some(([variant])=>variant.id==='later'))
  assert.deepEqual(wallPrintPage(catalog,{...query,searchParams:new URLSearchParams('size=A1')}).related,[[later]])
})
