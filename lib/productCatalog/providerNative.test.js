import test from 'node:test'
import assert from 'node:assert/strict'
import {providerNativeService} from './providerNative.server.js'
import {gelatoAdapter,prodigiAdapter} from './providers.js'
import {nativeProducts,nativeGelatoFetch} from '../../tests/fixtures/nativeProviderCatalog.js'
import {artworkGeometry,configurationCompatibility,approvedConfigurations,attributeOptions,matchesAttributes} from './configuration.js'

function metadataDb() {
  const rows=new Map(),writes=[]
  return {rows,writes,from(table){
    assert.equal(table,'provider_metadata_cache','Discovery must never depend on supplier runs/entries/groups or create commerce records')
    let key='',provider='',fingerprint,mutation,ignore=false,updated
    const persist=value=>{writes.push(value);rows.set(value.provider_code+':'+value.cache_key,value)}
    return {select(){return this},eq(field,value){if(field==='cache_key')key=value;if(field==='provider_code')provider=value;if(field==='fingerprint')fingerprint=value;return this},
      update(value){mutation=value;return this},
      async maybeSingle(){
        const row=rows.get(provider+':'+key)
        if(!mutation)return {data:row || null}
        if(ignore && row || fingerprint && row?.fingerprint!==fingerprint)return {data:null}
        updated={...row,...mutation};persist(updated);return {data:updated}
      },
      upsert(value,options){
        if(options?.ignoreDuplicates) {
          mutation=value;key=value.cache_key;provider=value.provider_code;ignore=true;return this
        }
        persist(value);return Promise.resolve({data:null})
      },
      then(resolve){return this.maybeSingle().then(resolve)}}

  }}
}
const selection={PaperFormat:'A2',FrameColor:'black'}
const input={provider:'gelato',catalogId:'framed-posters',country:'MX',selection,externalId:nativeProducts[0].productUid,variantId:nativeProducts[0].productUid}

test('empty cache/no active revision: native catalogs, structured attributes and exact filtered variants work without SKU indexing',async()=>{
  const db=metadataDb(),calls=[]
  const service=providerNativeService(db,()=>gelatoAdapter('fixture-key',nativeGelatoFetch({calls})))
  const discovery=await service.nativeDiscover({provider:'gelato',category:'framed'})
  assert.equal(discovery.presentations.length,1)
  assert.equal(discovery.presentations[0].catalogId,'framed-posters')
  assert.equal(discovery.presentations[0].id,'jbu:framed_print:framed-posters')
  const config=await service.nativeConfigure({provider:'gelato',catalogId:'framed-posters',country:'MX',selection})
  assert.equal(config.candidates.length,1)
  assert.equal(config.candidates[0].externalVariantId,nativeProducts[0].productUid)
  assert.deepEqual(calls.find(row=>row.body && Object.keys(row.body.attributeFilters || {}).length)?.body.attributeFilters,{PaperFormat:['A2'],FrameColor:['black']})
  const resolved=await service.nativeResolve(input)
  assert.equal(resolved.snapshot.mode,'native_v1')
  assert.equal(resolved.snapshot.variant.widthMm,420)
  assert.equal(resolved.snapshot.groupKey,'native:gelato:framed-posters')
  assert.equal(db.writes.length,3) // Catalog list + definition + forced fresh definition; only metadata, never search rows.
  assert.ok(db.writes.every(row=>!('variants' in row.value)))
})

test('invalid pairs, forged UIDs, unsupported fields and unsupported destinations fail on fresh provider data',async()=>{
  const service=providerNativeService(metadataDb(),()=>gelatoAdapter('fixture-key',nativeGelatoFetch()))
  const invalid=await service.nativeConfigure({...input,selection:{PaperFormat:'A2',FrameColor:'natural-wood'}})
  assert.equal(invalid.candidates.length,0)
  await assert.rejects(service.nativeResolve({...input,selection:{PaperFormat:'A2',FrameColor:'natural-wood'}}),{code:'native_configuration_changed'})
  await assert.rejects(service.nativeResolve({...input,externalId:'invented_UID',variantId:'invented_UID'}),{code:'native_configuration_changed'})
  await assert.rejects(service.nativeConfigure({...input,selection:{NotAnAttribute:'anything'}}),{code:'native_attribute_invalid'})
  await assert.rejects(service.nativeResolve({...input,country:'GB'}),{code:'provider_variant_unavailable'})
})

test('metadata cache expiry refreshes, failures show stale metadata, and stale metadata never authorizes resolution',async()=>{
  let now=Date.parse('2026-11-20T12:00:00Z'),fail=false
  const calls=[],db=metadataDb()
  const adapter=()=>gelatoAdapter('fixture-key',nativeGelatoFetch({calls,failAll:fail}))
  const service=providerNativeService(db,adapter,{now:()=>now})
  await service.nativeDefinition(input)
  await service.nativeDefinition(input)
  assert.equal(calls.length,1)
  now+=25*3600000;fail=true
  const stale=await service.nativeDefinition(input)
  assert.equal(stale.cache.stale,true)
  await assert.rejects(service.nativeResolve(input),{code:'provider_rate_limited'})
  fail=false
  assert.equal((await service.nativeDefinition(input)).cache.stale,false)
})

test('cache storage outages do not turn metadata persistence into a required discovery index',async()=>{
  const db={from(){throw new Error('cache table unavailable')}}
  const service=providerNativeService(db,()=>gelatoAdapter('fixture-key',nativeGelatoFetch()))
  assert.equal((await service.nativeDiscover({provider:'gelato',category:'framed'})).presentations.length,1)
  assert.equal((await service.nativeResolve(input)).variant.externalVariantId,input.variantId)
})

test('changed provider attributes cannot silently replace a selected manufacturing configuration',async()=>{
  const changed=nativeProducts.map(row=>({...row,attributes:{...row.attributes,FrameColor:'natural-wood'}}))
  const service=providerNativeService(metadataDb(),()=>gelatoAdapter('fixture-key',nativeGelatoFetch({products:changed})))
  await assert.rejects(service.nativeResolve(input),{code:'native_configuration_changed'})
})

test('Prodigi uses native parents and reported combinations, not Gelato filtering or a Cartesian product',async()=>{
  const parent={id:'prod-framed-art',name:'Framed fine art',category:'wall-art/framed-prints',attributes:{framecolour:['black','natural'],glaze:['clear','matte']}}
  const variant={id:'REAL-SKU',sku:'REAL-SKU',dimensions:{width:{mm:297},height:{mm:420}},
    attributeOptions:parent.attributes,combinations:[{attributes:{framecolour:'black',glaze:'clear'}},{attributes:{framecolour:'natural',glaze:'matte'}}]}
  const calls=[]
  const adapter=()=>prodigiAdapter('fixture-key',async(url,options)=>{
    calls.push([url,options.body])
    return Response.json(url.includes('/variants?') ? {data:[variant],total:1} : url.includes('/products?') ? {data:[parent],total:1} : {data:parent})
  })
  const service=providerNativeService(metadataDb(),adapter)
  assert.equal((await service.nativeDiscover({provider:'prodigi',category:'framed_print'})).presentations[0].catalogId,parent.id)
  const config=await service.nativeConfigure({provider:'prodigi',catalogId:parent.id,country:'MX'})
  assert.equal(config.candidates.length,2)
  const discovery=await service.nativeDiscover({provider:'prodigi',category:'framed_print',complete:true})
  const presentation=discovery.presentationCandidates[0]
  const snapshot=await service.nativeMatrixSnapshot({provider:'prodigi',catalogId:parent.id,presentationId:presentation.id,country:'MX'})
  assert.equal(snapshot.matrix.complete,true)
  assert.equal(snapshot.matrix.candidates.length,2)
  const resolved=await service.nativeResolve({provider:'prodigi',catalogId:parent.id,externalId:parent.id,variantId:variant.id,
    configuration:{framecolour:'black',glaze:'clear'},selection:{framecolour:'black'},country:'MX'})
  assert.equal(resolved.snapshot.variant.sku,'REAL-SKU')
  await assert.rejects(service.nativeResolve({provider:'prodigi',catalogId:parent.id,externalId:parent.id,variantId:variant.id,
    configuration:{framecolour:'black',glaze:'matte'},country:'MX'}),{code:'native_configuration_invalid'})
  assert.ok(calls.every(([,body])=>body===undefined))
})

test('artwork geometry estimates crop/borders and DPI without changing supplier identity or certifying production',()=>{
  const art=artworkGeometry({widthPx:3000,heightPx:6000})
  assert.equal(art.orientation,'portrait')
  const contain=configurationCompatibility(art,{widthMm:300,heightMm:300},'contain')
  const cover=configurationCompatibility(art,{widthMm:300,heightMm:300},'cover')
  assert.equal(contain.borderFraction,0.5)
  assert.equal(cover.cropFraction,0.5)
  assert.equal(contain.effectiveDpi,508)
  assert.equal(cover.effectiveDpi,254)
  assert.equal(cover.requiresProductionValidation,true)
  assert.equal(configurationCompatibility(art,{}).known,false)
})

test('public configuration choices use only explicitly approved projections and never add provider-manufacturable combinations',()=>{
  const variants=[{id:'black',productId:'offer',attributes:[{code:'size',value:'A2'},{code:'frame_color',value:'black'}]},
    {id:'natural',productId:'offer',attributes:[{code:'size',value:'A3'},{code:'frame_color',value:'natural'}]}]
  const approved=approvedConfigurations(variants,'offer')
  assert.deepEqual(attributeOptions(approved,{size:'A2'}).frame_color,['black'])
  assert.equal(approved.filter(row=>matchesAttributes(row.attributes,{size:'A2',frame_color:'natural'})).length,0)
})

test('catalog body transport failures preserve safe retry diagnostics without persisting a commercial selection',async()=>{
  const db=metadataDb()
  const service=providerNativeService(db,()=>gelatoAdapter('secret-key',async()=>new Response(new ReadableStream({start(controller){
    controller.error(Object.assign(new Error('do not expose request credentials'),{cause:{code:'UND_ERR_BODY_TIMEOUT'}}))
  }}))))
  await assert.rejects(service.nativeDefinition(input),error=>{
    assert.equal(error.code,'provider_unreachable')
    assert.equal(error.failureKind,'timeout')
    assert.equal(error.failurePhase,'body')
    assert.ok(!JSON.stringify(error).includes('credentials'))
    return true
  })
  assert.equal(db.writes.length,0)
})

test('opaque provider identifiers resolve through native metadata without any Wall Art UID parser',async()=>{
  const uid='opaque-provider-reference-149-z'
  const service=providerNativeService(metadataDb(),()=>gelatoAdapter('fixture-key',nativeGelatoFetch({products:[{...nativeProducts[0],productUid:uid}]})))
  const resolved=await service.nativeResolve({...input,externalId:uid,variantId:uid})
  assert.equal(resolved.snapshot.family,'framed_print')
  assert.equal(resolved.variant.externalVariantId,uid)
})

// Acrylic identity is from the supplied audit. Attribute responses remain documented-shape fixtures.
const acrylicUid='acrylic_12x12-inch-300x300-mm_4-mm_4-0_hor'
const acrylicDefinition={catalogUid:'acrylic',title:'Acrylic',productAttributes:[
  {productAttributeUid:'Orientation',title:'Orientation',values:[{productAttributeValueUid:'hor',title:'Landscape'}]},
]}
const acrylicProduct={productUid:acrylicUid,attributes:{Orientation:'hor'},supportedCountries:['MX'],
  dimensions:{Width:{value:300,measureUnit:'mm'},Height:{value:300,measureUnit:'mm'}}}
function acrylicService({definition=acrylicDefinition,search={products:[acrylicProduct]},calls=[]}={}) {
  return providerNativeService(metadataDb(),()=>gelatoAdapter('fixture-key',async(url,options)=>{
    calls.push({url,body:options.body ? JSON.parse(options.body) : null})
    return Response.json(url.endsWith('/products:search') ? search : url.includes('/products/') ? acrylicProduct : definition)
  }))
}
test('the reported initial Acrylic request permits an empty selection and returns exact supplier candidates',async()=>{
  const calls=[]
  const result=await acrylicService({calls}).nativeConfigure({provider:'gelato',catalogId:'acrylic',selection:{},offset:0,country:'MX'})
  assert.equal(result.schema.family,'acrylic')
  assert.equal(result.candidates[0].externalVariantId,acrylicUid)
  assert.equal(result.candidates[0].widthMm,300)
  assert.deepEqual(calls[1].body,{limit:25,offset:0,attributeFilters:{}})
})
test('malformed Acrylic definitions identify the failing field without returning raw provider values',async()=>{
  for(const [definition,responseField] of [
    [{...acrylicDefinition,catalogUid:'secret-example'},'catalogUid'],
    [{...acrylicDefinition,productAttributes:null},'productAttributes'],
    [{...acrylicDefinition,productAttributes:[null]},'productAttributes[].productAttributeUid'],
    [{...acrylicDefinition,productAttributes:[{productAttributeUid:'Orientation',values:null}]},'productAttributes[].values'],
    [{...acrylicDefinition,productAttributes:[{productAttributeUid:'Orientation',values:[null]}]},'productAttributes[].values[].productAttributeValueUid'],
  ]) {
    await assert.rejects(acrylicService({definition}).nativeConfigure({provider:'gelato',catalogId:'acrylic',country:'MX'}),error=>{
      assert.equal(error.code,'invalid_provider_response')
      assert.equal(error.providerOperation,'catalog_definition')
      assert.equal(error.responseField,responseField)
      assert.ok(!JSON.stringify(error).includes('secret-example'))
      return true
    })
  }
})
test('malformed Acrylic search and pagination remain fail closed with a distinct operation',async()=>{
  for(const [search,responseField] of [
    [{products:null},'products'],[{products:[null]},'products[].productUid'],
    [{products:[acrylicProduct],nextOffset:0},'pagination'],
  ]) {
    await assert.rejects(acrylicService({search}).nativeConfigure({provider:'gelato',catalogId:'acrylic',country:'MX'}),error=>{
      assert.equal(error.code,'invalid_provider_response')
      assert.equal(error.providerOperation,'catalog_search')
      assert.equal(error.responseField,responseField)
      return true
    })
  }
})

test('Acrylic attributes without a values array use authoritative catalog-wide facets and resolve exact UIDs',async()=>{
  for(const missingValues of [undefined,null,{unexpected:'shape'}]) {
    const calls=[]
    const definition={...acrylicDefinition,productAttributes:[{productAttributeUid:'Orientation',title:'Orientation',values:missingValues}]}
    const search={products:[acrylicProduct],hits:{attributeHits:{Orientation:{hor:2,ver:0}}}}
    const service=acrylicService({definition,search,calls})
    const initial=await service.nativeConfigure({provider:'gelato',catalogId:'acrylic',selection:{},offset:0,country:'MX'})
    assert.deepEqual(initial.schema.attributes[0].values,[{id:'hor',title:'hor'}])
    assert.equal(initial.candidates[0].externalVariantId,acrylicUid)
    assert.deepEqual(calls.filter(row=>row.body).map(row=>row.body),[{limit:1,offset:0},{limit:25,offset:0,attributeFilters:{}}])
    const resolved=await service.nativeResolve({provider:'gelato',catalogId:'acrylic',country:'MX',selection:{Orientation:'hor'},externalId:acrylicUid,variantId:acrylicUid})
    assert.equal(resolved.variant.externalVariantId,acrylicUid)
    // A fresh definition at save time obtains fresh native facets as well.
    assert.equal(calls.filter(row=>row.body?.limit===1).length,2)
    await assert.rejects(service.nativeConfigure({provider:'gelato',catalogId:'acrylic',country:'MX',selection:{Orientation:'invented'}}),{code:'native_attribute_invalid'})
  }
})
test('missing values cannot be inferred from individual products or unvalidated facet counts',async()=>{
  const definition={...acrylicDefinition,productAttributes:[{productAttributeUid:'Orientation',values:null}]}
  for(const hits of [undefined,{},[],{hor:'2'},{hor:-1},{hor:0},{hor:1.5}]) {
    await assert.rejects(acrylicService({definition,search:{products:[acrylicProduct],hits:{attributeHits:{Orientation:hits}}}})
      .nativeDefinition({provider:'gelato',catalogId:'acrylic'}),{code:'invalid_provider_response',responseField:'productAttributes[].values'})
  }
})
test('multiple missing attribute lists share one bounded facet read; normal definitions need none',async()=>{
  const calls=[]
  const definition={...acrylicDefinition,productAttributes:[{productAttributeUid:'Orientation'},{productAttributeUid:'Thickness',values:null}]}
  const result=await acrylicService({definition,calls,search:{products:[acrylicProduct],hits:{attributeHits:{Orientation:{hor:1},Thickness:{'4-mm':1}}}}})
    .nativeDefinition({provider:'gelato',catalogId:'acrylic'})
  assert.equal(result.attributes.length,2)
  assert.equal(calls.length,2)
  assert.deepEqual(calls[1].body,{limit:1,offset:0})
  const normalCalls=[]
  await acrylicService({calls:normalCalls}).nativeDefinition({provider:'gelato',catalogId:'acrylic'})
  assert.equal(normalCalls.length,1)
})

test('complete matrices survive a new service instance, stay isolated by country, and survive failed refresh',async()=>{
  const db=metadataDb(),calls=[]
  let now=Date.parse('2026-11-20T12:00:00Z'),fail=false
  const adapter=()=>gelatoAdapter('fixture-key',nativeGelatoFetch({calls,failAll:fail}))
  const service=()=>providerNativeService(db,adapter,{now:()=>now})
  const request={provider:'gelato',catalogId:'framed-posters',presentationId:'jbu:framed_print:framed-posters',country:'MX'}
  const discovery=await service().nativeDiscover({provider:'gelato',category:'framed',country:'MX',complete:true})
  assert.equal(discovery.presentationCandidates.length,1)
  assert.equal(calls.filter(row=>row.url.endsWith('/products:search')).length,0)
  const [first, concurrent]=await Promise.all([service().nativeMatrixSnapshot(request),service().nativeMatrixSnapshot(request)])
  assert.deepEqual(concurrent.matrix,first.matrix)
  assert.equal(calls.filter(row=>row.url.endsWith('/products:search')).length,2)
  assert.ok(first.matrix.complete)
  assert.equal(first.matrix.candidates.length,2)
  const initialCalls=calls.length
  assert.deepEqual((await service().nativeMatrixSnapshot(request)).matrix,first.matrix)
  assert.equal(calls.length,initialCalls)
  const gb=await service().nativeMatrixSnapshot({...request,country:'GB'})
  assert.deepEqual(gb.matrix.candidates,[])
  now+=7*3600000
  fail=true
  const saved=await service().nativeMatrixSnapshot(request)
  assert.equal(saved.cache.stale,true)
  assert.equal(saved.cache.fetchedAt,first.cache.fetchedAt)
  await assert.rejects(service().nativeMatrixSnapshot({...request,refresh:true}),{code:'provider_rate_limited'})
  assert.deepEqual((await service().nativeMatrixSnapshot(request)).matrix,first.matrix)
})

test('a large matrix resumes persisted offsets from another service instance and publishes only the complete snapshot',async()=>{
  const db=metadataDb(),offsets=[]
  const provider=gelatoAdapter('fixture-key',nativeGelatoFetch())
  const make=()=>providerNativeService(db,()=>({...provider,async search({offset}){
    offsets.push(offset)
    const original=(await provider.product(nativeProducts[0].productUid))
    const uid='framed-fixture-'+offset
    return {items:[{...original,externalId:uid,variants:original.variants.map(row=>({...row,externalVariantId:uid}))}],
      pagination:{offset,sourceCount:1,sourceIds:[uid],total:8}}
  }}))
  const request={provider:'gelato',catalogId:'framed-posters',presentationId:'jbu:framed_print:framed-posters',country:'MX'}
  const first=await make().nativeMatrixSnapshot(request)
  assert.deepEqual(first,{pending:true,progress:{pages:3}})
  assert.ok(![...db.rows.keys()].some(key=>key.includes('complete-matrix')))
  assert.equal((await make().nativeMatrixSnapshot({...request,resume:true})).pending,true)
  const complete=await make().nativeMatrixSnapshot({...request,resume:true})
  assert.equal(complete.matrix.complete,true)
  assert.deepEqual(offsets,[0,1,2,3,4,5,6,7])
  assert.equal(complete.matrix.candidates.length,8)
  assert.deepEqual((await make().nativeMatrixSnapshot({...request,selection:{}})).matrix,complete.matrix)
  assert.equal(offsets.length,8)
})
