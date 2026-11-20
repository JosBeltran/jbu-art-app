import test from 'node:test'
import assert from 'node:assert/strict'
import {observedPostersResponse,simulatedPosters,observedPostersFetch} from '../../tests/fixtures/gelatoPostersObserved.js'
import {presentationDefinitions,presentationMatches,configurationFields} from './presentations.js'
import {providerNativeService} from './providerNative.server.js'
import {gelatoAdapter,prodigiAdapter} from './providers.js'
import {operations} from './contracts.js'

const schema=observedPostersResponse.schema
const definitions=presentationDefinitions('gelato','posters',schema)
// Positive products below are explicitly contract simulations; the observed response
// contains ONLY cards and cannot establish a successful live poster resolution.
function db() {
  const rows=new Map()
  return {from(table){assert.equal(table,'provider_metadata_cache','Browsing must never read/write commercial or exhaustive-index tables');let key='';return {
    select(){return this},eq(field,value){if(field==='cache_key')key=value;return this},async maybeSingle(){return {data:rows.get(key)}},async upsert(row){rows.set(row.cache_key,row);return {data:null}},
  }}}
}
function engine({products=simulatedPosters,calls=[],ignoreFilters=false}={}) {
  return providerNativeService(db(),()=>gelatoAdapter('fixture-key',observedPostersFetch({products,calls,ignoreFilters})))
}

const presentationId='jbu:poster:200gsm-uncoated'
const input={provider:'gelato',catalogId:'posters',presentationId,country:'MX'}

test('observed 14-attribute schema yields explicit, versioned paper presentations, not catalog or UID cards',()=>{
  assert.equal(schema.attributes.length,14)
  assert.equal(definitions.length,5)
  assert.equal(new Set(definitions.map(row=>row.id)).size,5)
  assert.ok(definitions.every(row=>row.version===1 && row.catalogRefs[0].catalogId==='posters'))
  assert.ok(definitions.find(row=>row.id===presentationId).filters.PaperType.includes('80-lb-cover-uncoated'))
  assert.ok(!definitions.find(row=>row.id===presentationId).filters.PaperType.includes('80-lb-text-uncoated'))
  assert.deepEqual(configurationFields(schema,definitions[0]).map(row=>row.id),['PaperFormat','Orientation','CoatingType'])
})
test('all eight actual observed cards are excluded, including a card forged to have matching paper',()=>{
  for(const row of observedPostersResponse.candidates)for(const definition of definitions)
    assert.equal(presentationMatches(definition,{externalId:row.externalId},{attributes:row.sourceAttributes}),false)
  assert.equal(presentationMatches(definitions[0],{externalId:observedPostersResponse.candidates[0].externalId},
    {attributes:{...observedPostersResponse.candidates[0].sourceAttributes,PaperType:'200-gsm-uncoated'}}),false)
})
test('discovery separates supplier/category from validated commercial cards and creates no commercial records',async()=>{
  const calls=[],service=engine({calls})
  const categories=await service.nativeDiscover({provider:'gelato'})
  assert.deepEqual(categories.categories.map(row=>row.id),['posters'])
  assert.equal(categories.presentations.length,0)
  assert.equal(calls.length,1)
  const result=await service.nativeDiscover({provider:'gelato',category:'posters',country:'MX'})
  assert.deepEqual(result.presentations.map(row=>row.id),[presentationId,'jbu:poster:170gsm-coated-silk'])
  assert.ok(result.presentations.every(row=>row.image.permission==='unavailable' && row.evidence.verifiedCandidates>0))
  assert.ok(calls.filter(row=>row.body).every(row=>row.body.offset===0 && row.body.limit===25))
})
test('observed cards-only response produces zero verified commercial cards, never fabricated storefront inventory',async()=>{
  const result=await engine({products:[],ignoreFilters:true}).nativeDiscover({provider:'gelato',category:'posters',country:'MX'})
  assert.equal(result.presentations.length,0)
})
test('dependent options come only from matching source combinations despite polluted supplier facets',async()=>{
  const service=engine({ignoreFilters:true})
  const initial=await service.nativeConfigure(input)
  assert.deepEqual(initial.candidates.map(row=>row.externalVariantId),simulatedPosters.slice(0,2).map(row=>row.productUid))
  assert.deepEqual(initial.schema.attributes.find(row=>row.id==='PaperFormat').values.map(row=>row.id),['A2','A3'])
  assert.ok(initial.candidates.every(row=>Object.keys(row.attributes).every(key=>['size','orientation','finish','paper'].includes(key))))
  assert.equal(initial.technical.attributes.length,14)
  const dependent=await service.nativeConfigure({...input,selection:{PaperFormat:'A2'}})
  assert.deepEqual(dependent.schema.attributes.find(row=>row.id==='Orientation').values.map(row=>row.id),['ver'])
  const invalid=await service.nativeConfigure({...input,selection:{PaperFormat:'A2',Orientation:'hor'}})
  assert.equal(invalid.candidates.length,0)
  assert.deepEqual(invalid.incompatibleOptions,['PaperFormat','Orientation'])
})
test('exact save resolution preserves presentation metadata and source identities and rejects bypass attempts',async()=>{
  const service=engine({ignoreFilters:true})
  const exact={...input,externalId:simulatedPosters[0].productUid,variantId:simulatedPosters[0].productUid,selection:{PaperFormat:'A2'}}
  const result=await service.nativeResolve(exact)
  assert.equal(result.snapshot.groupKey,presentationId)
  assert.equal(result.snapshot.presentation.id,presentationId)
  assert.equal(result.snapshot.presentation.version,1)
  assert.equal(result.variant.externalVariantId,exact.variantId)
  const card=observedPostersResponse.candidates[0].externalId
  await assert.rejects(service.nativeResolve({...exact,externalId:card,variantId:card,selection:{}}),{code:'native_presentation_mismatch'})
  await assert.rejects(service.nativeResolve({...exact,presentationId:'jbu:poster:170gsm-coated-silk'}),{code:'native_presentation_mismatch'})
  await assert.rejects(service.nativeConfigure({...input,selection:{Variable:'yes'}}),{code:'native_attribute_invalid'})
  await assert.rejects(service.nativeConfigure({...input,presentationId:'invented'}),{code:'native_presentation_unsupported'})
  assert.equal(operations.nativeConfigure.schema.safeParse({provider:'gelato',catalogId:'posters',country:'MX'}).success,false)
})

test('Prodigi shares the presentation contract while retaining its reported-combination capabilities',async()=>{
  const parent={id:'framed-parent',name:'Framed art',category:'wall-art/framed-prints',attributes:{framecolour:['black','natural'],glaze:['clear','matte'],State:['published']}}
  const variant={id:'native-framed-variant',sku:'REAL-FIXTURE-SKU',attributeOptions:parent.attributes,
    combinations:[{attributes:{framecolour:'black',glaze:'clear',State:'published'}},{attributes:{framecolour:'natural',glaze:'matte',State:'published'}}]}
  const service=providerNativeService(db(),()=>prodigiAdapter('fixture-key',async url=>Response.json(url.includes('/variants?') ? {data:[variant],total:1} : url.includes('/products?') ? {data:[parent],total:1} : {data:parent})))
  const discovery=await service.nativeDiscover({provider:'prodigi',category:'framed_print'})
  const card=discovery.presentations[0]
  assert.equal(card.id,'jbu:framed_print:framed-parent')
  assert.equal(card.capabilities.destinationCost,false)
  const input={provider:'prodigi',catalogId:parent.id,presentationId:card.id,country:'MX',selection:{framecolour:'black'}}
  const result=await service.nativeConfigure(input)
  assert.deepEqual(result.schema.attributes.map(field=>field.id),['framecolour','glaze'])
  assert.equal(result.candidates.length,1)
  assert.deepEqual(result.schema.attributes.find(field=>field.id==='glaze').values.map(value=>value.id),['clear'])
  const resolved=await service.nativeResolve({...input,externalId:parent.id,variantId:variant.id,configuration:{framecolour:'black',glaze:'clear',State:'published'}})
  assert.equal(resolved.snapshot.presentation.id,card.id)
  await assert.rejects(service.nativeResolve({...input,externalId:parent.id,variantId:variant.id,configuration:{framecolour:'black',glaze:'matte',State:'published'}}),{code:'native_configuration_invalid'})
})

test('unknown or conflicting product classes, inactive stock and unsupported specialty finishing fail the presentation rules',()=>{
  const definition=definitions.find(row=>row.id===presentationId)
  const product={externalId:'poster-contract-class-fixture'}
  const attributes={PaperType:'200-gsm-uncoated',State:'published',ProductStatus:'activated',Variable:'no'}
  assert.equal(presentationMatches(definition,product,{attributes}),true)
  for(const patch of [{ProductType:'stickers'},{ProductFamily:'canvas'},{State:'draft'},{ProductStatus:'deactivated'},{Variable:'yes'},{SpotFinishingType:'foil-gold-1-0'}])
    assert.equal(presentationMatches(definition,product,{attributes:{...attributes,...patch}}),false)
})
