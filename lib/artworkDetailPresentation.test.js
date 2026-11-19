import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relatedPublicArtworkVersions, legacyArtworkPrintCountries, commercialArtworkPrintCountries } from './artworkDetailPresentation.js'

test('version presentation retains public RPC order, deduplicates and never walks cycles',()=>{
 const historical={id:'past',sku:'PAST',version_parent_id:'current',is_historical_version:true}
 const published={id:'future',sku:'FUTURE',version_kind:'SUCCESSOR',version_published_at:'2026-01-01',version_parent_id:'past'}
 const result=relatedPublicArtworkVersions({id:'current',version_family:[historical,historical,{id:'current',sku:'CURRENT'},
  {id:'private',sku:'PRIVATE',status:'DRAFT'},{id:'draft',sku:'DRAFT',version_kind:'SUCCESSOR'},published]})
 assert.deepEqual(result,[historical,published])
 assert.deepEqual(relatedPublicArtworkVersions({id:'current'}),[])
})

test('legacy print destinations preserve opt-in, activity, price, edition and managed-fallback rules',()=>{
 const variant={id:'print',is_active:true,price:100,edition_type:'OPEN',effective_shipping_countries:['MX']}
 const art={allows_prints:true,effective_shipping_countries:['MX','US'],artwork_prints:[variant]}
 assert.deepEqual(legacyArtworkPrintCountries(art),['MX'])
 for(const change of [{is_active:false},{is_available:false},{price:0},{edition_type:'LIMITED',max_edition_size:2,prints_sold:2}]){
  assert.deepEqual(legacyArtworkPrintCountries({...art,artwork_prints:[{...variant,...change}]}),[])
 }
 assert.deepEqual(legacyArtworkPrintCountries({...art,allows_prints:false}),[])
 const old={...art,artwork_prints:[],print_price_mxn:100,print_type:'OPEN'}
 assert.deepEqual(legacyArtworkPrintCountries(old),['MX','US'])
 assert.deepEqual(legacyArtworkPrintCountries({...old,has_managed_prints:true}),[])
})

test('commercial destinations require existing active storefront prices for each country',()=>{
 const variant={id:'variant',countries:['MX','US'],priceBooks:[{id:'book',country:'MX',currency:'MXN',status:'active',channel:'storefront',priority:0}],
  entries:[{product_variant_id:'variant',price_book_id:'book',amount_minor:50000,status:'active'}]}
 assert.deepEqual(commercialArtworkPrintCountries([variant]),['MX'])
 assert.deepEqual(commercialArtworkPrintCountries([{...variant,entries:[]}]),[])
})
