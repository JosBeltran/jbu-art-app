import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSupplierEntries, fingerprint, nextSupplierOffset, retryDelay } from './supplierCatalog.js'
import { gelatoAdapter,prodigiAdapter } from './providers.js'
import { matchingStudioVariants } from './studioDiscovery.js'
import { studioProductVariants } from './studioDiscovery.server.js'

const product=(tail,attributes={})=>{const id='frame_and_poster_product_'+tail;return {externalId:id,title:id,category:'posters',
  supportedCountries:['MX'],variants:[{externalVariantId:id,sku:id,attributes}]}}
const entry=p=>normalizeSupplierEntries('gelato',p)[0]
test('commercial construction identity retains paper, substrate and frame materials while sizes, orientation and colors remain options',()=>{
  const black=entry(product('frs_30x40-cm_frc_black_frm_wood_pt_cotton_ver'))
  const natural=entry(product('frs_50x70-cm_frc_natural_frm_wood_pt_cotton_hor'))
  const metalFrame=entry(product('frs_50x70-cm_frc_black_frm_aluminium_pt_cotton_ver'))
  const otherPaper=entry(product('frs_50x70-cm_frc_black_frm_wood_pt_matte_ver'))
  assert.equal(black.groupKey,natural.groupKey)
  assert.notEqual(black.groupKey,metalFrame.groupKey)
  assert.notEqual(black.groupKey,otherPaper.groupKey)
  assert.notEqual(black.metadata.titles[0],metalFrame.metadata.titles[0])
  assert.deepEqual([black.variant.widthMm,black.variant.heightMm],[300,400])
  assert.equal(entry(product('frs_A3_frc_black_frm_wood_pt_cotton')).variant.sizeCode,'A3')
  assert.notEqual(entry(product('frs_A3_custom-wrap')).groupKey,entry(product('frs_A3_other-wrap')).groupKey)
})
test('structured construction overrides parsed UID selectors and a verified parent groups dimension-specific IDs deterministically',()=>{
  const first=product('frs_30x40-cm_pt_matte',{PaperType:'cotton'})
  const second=product('frs_50x70-cm_pt_cotton',{PaperType:'cotton'})
  first.rawMetadata={commercialProductId:'framed-cotton'};second.rawMetadata={productGroupId:'framed-cotton'}
  assert.equal(entry(first).groupKey,entry(second).groupKey)
  assert.equal(entry(first).metadata.identitySource,'structured_parent')
  assert.equal(fingerprint({b:2,a:1}),fingerprint({a:1,b:2}))
  assert.deepEqual(normalizeSupplierEntries('gelato',{externalId:'cards_pf_A4'}),[])
})
test('Gelato adapter preserves source metadata, short-page continuation and unverified image provenance',async()=>{
  const row={productUid:'poster_product_pf_30x40-cm_pt_cotton',description:'Cotton paper',images:[{url:'https://supplier.example/photo.jpg'}],dimensions:{Width:{measureUnit:'cm',value:30},Height:{measureUnit:'cm',value:40}}}
  const api=gelatoAdapter('test-key',async()=>Response.json({products:[row],nextOffset:25,total:26}))
  const page=await api.search({category:'posters',offset:0})
  assert.equal(nextSupplierOffset(page,0,1),25)
  const indexed=entry(page.items[0])
  assert.equal(indexed.product.rawMetadata.description,'Cotton paper')
  assert.equal(indexed.metadata.images[0].permission,'unverified')
  assert.equal(indexed.metadata.image,null)
  assert.equal(indexed.variant.widthMm,300)
})
test('Prodigi adapters retain parent metadata and expand only reported combinations without a Cartesian product',async()=>{
  const api=prodigiAdapter('test-key',async url=>Response.json(url.includes('/variants?') ? {data:[{id:'real-variant',sku:'REAL-A3',
    attributeOptions:{framecolour:['black','natural'],glaze:['clear','matte']},combinations:[{attributes:{framecolour:'black',glaze:'clear'}},{attributes:{framecolour:'natural',glaze:'matte'}}]}],total:1}
    : {data:{id:'framed-print',name:'Framed poster',description:'Wood frame',category:'wall-art'}}))
  const product=await api.product('framed-print')
  const normalized=normalizeSupplierEntries('prodigi',product)
  assert.equal(normalized[0].product.rawMetadata.description,'Wood frame')
  const variants=studioProductVariants({...product,variants:normalized.map(row=>row.variant)},0).variants
  assert.equal(variants.length,2)
  assert.equal(matchingStudioVariants(variants,{frame_color:'black',glazing:'matte'}).length,0)
  assert.equal(variants[0].sku,'REAL-A3')
  assert.equal(studioProductVariants({externalId:'framed-print',variants:[{externalVariantId:'x',options:{finish:['matte']}}]},0).variants.length,0)
})
test('pagination rejects non-advancing and contradictory responses; retry honors numeric and HTTP-date Retry-After',()=>{
  for(const page of [{nextOffset:0},{total:25,nextOffset:25}])assert.throws(()=>nextSupplierOffset(page,0,0),/pagination_invalid/)
  assert.throws(()=>nextSupplierOffset({total:26},25,0),/pagination_invalid/)
  assert.equal(nextSupplierOffset({total:26},25,1),null)
  assert.equal(retryDelay({retryAfter:'120'},1),120)
  assert.equal(retryDelay({retryAfter:'Fri, 20 Nov 2026 12:02:00 GMT'},0,Date.parse('2026-11-20T12:00:00Z')),120)
  assert.equal(retryDelay({},4),80)
})

test('Prodigi uses physical dimensions rather than nominal display labels and retains unreported geometry as unknown',()=>{
  const raw={externalId:'prod-enhanced-matte-art',title:'Fine art',attributes:{PaperType:['cotton']},variants:[
    {externalVariantId:'sku-20x28',sku:'SKU-20X28',size:'50x70cm',widthMm:508,heightMm:711.2},
    {externalVariantId:'sku-unknown',sku:'SKU-UNKNOWN',size:'50x70cm'}]}
  const entries=normalizeSupplierEntries('prodigi',raw)
  assert.deepEqual([entries[0].variant.widthMm,entries[0].variant.heightMm],[508,711.2])
  assert.equal(entries[1].variant.widthMm,null)
  assert.equal(entries[1].variant.dimensionsSource,'unreported')
  assert.equal(entries[0].variant.attributes.paper,'cotton')
})
