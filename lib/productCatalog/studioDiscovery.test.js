import assert from 'node:assert/strict'
import test from 'node:test'
import { gelatoSeries, matchingStudioVariants, mergeStudioGroups, studioGroup, studioVariantKey } from './studioDiscovery.js'
import { discoverStudioProducts, studioProductVariants } from './studioDiscovery.server.js'
const prefix = 'frame_and_poster_product'
const gelato = (tail, options={}) => {
  const externalId = prefix+'_'+tail
  return { externalId,title:externalId,category:'posters',supportedCountries:['MX'],variants:[{externalVariantId:externalId,sku:externalId,
    attributes:options}] }
}
const black = gelato('frs_300x400-mm_frc_black_frm_aluminium_pt_matte_ct_matte_ver',{PaperType:'matte'})
const natural = gelato('frs_500x700-mm_frc_natural_frm_wood_pt_matte_ct_matte_ver')
const different = gelato('frs_500x700-mm_frc_natural_frm_wood_pt_matte_ct_matte_custom-wrap_ver')

test('Gelato groups known selectors across pages while retaining unknown product-defining attributes',()=>{
  const groups = mergeStudioGroups([studioGroup('gelato',black)],[studioGroup('gelato',natural),studioGroup('gelato',different)])
  assert.equal(groups.length,2)
  assert.equal(groups[0].name,null)
  assert.equal(groups[0].group,'framed_print')
  assert.equal(groups[0].variants.length,2)
  assert.equal(groups[1].variants.length,1)
  assert.equal(gelatoSeries(natural.externalId).attributes.frame_material,'wood')
  assert.equal(matchingStudioVariants(groups[0].variants,{size:'300x400-mm',frame_color:'natural'}).length,0)
  assert.equal(matchingStudioVariants(groups[0].variants,{size:'500x700-mm',frame_color:'natural'})[0].externalVariantId,natural.externalId)
  assert.equal(studioGroup('gelato',{externalId:'cards_300x400-mm',title:'Cards',category:'posters'}),null)
})

test('provider cursor merges later SKU pages without changing product identity and identifies rate-limit partials',async()=>{
  const calls=[]
  const adapter = name => ({
    async categories(){return [{id:'posters',title:'Posters'}]},
    async search(input) {
      calls.push([name,input.offset])
      if (name==='prodigi') throw Object.assign(new Error(),{code:'provider_rate_limited'})
      return {items:input.offset ? [natural] : [black],nextOffset:input.offset ? null : 25}
    },
  })
  const first=await discoverStudioProducts(adapter,{provider:'all',country:'MX',refresh:true})
  assert.equal(first.hasMore,true)
  assert.deepEqual(first.issues,[{provider:'prodigi',code:'provider_rate_limited'}])
  const next=await discoverStudioProducts(adapter,{provider:'gelato',country:'MX',cursor:first.cursor,refresh:true})
  assert.equal(next.hasMore,false)
  assert.equal(mergeStudioGroups(first.groups,next.groups)[0].variants.length,2)
  assert.deepEqual(calls.filter(([provider])=>provider==='gelato'),[['gelato',0],['gelato',25]])
})

test('Prodigi uses catalogue parent identity and only expands exact reported combinations',()=>{
  const product = {externalId:'prod-framed-posters',title:'Framed poster',category:'wall-art/framed-prints',
    total:27,variants:[{externalVariantId:'variant-1',sku:'FRAME-A3',size:'A3',attributes:{},
      combinations:[{attributes:{framecolour:'black',glaze:'Clear'}},{attributes:{framecolour:'natural',glaze:'Matte'}}]}]}
  const group=studioGroup('prodigi',product)
  assert.equal(group.externalId,product.externalId)
  const page=studioProductVariants(product,25)
  assert.equal(page.nextOffset,26)
  assert.equal(page.variants.length,2)
  assert.equal(matchingStudioVariants(page.variants,{frame_color:'black',glazing:'Matte'}).length,0)
  assert.equal(new Set(page.variants.map(studioVariantKey)).size,2)
  assert.equal(page.variants[0].externalVariantId,'variant-1')
})

test('long Gelato catalogues share the progressive scan with each other',async()=>{
  const queries=[]
  const adapter = () => ({
    async categories(){return [{id:'posters',title:'Posters'},{id:'canvases',title:'Canvases'}]},
    async search(input){
      queries.push([input.category,input.offset])
      return {items:[black],nextOffset:input.category==='posters' && input.offset===0 ? 25 : null}
    },
  })
  let result=await discoverStudioProducts(adapter,{provider:'gelato',country:'MX',refresh:true})
  result=await discoverStudioProducts(adapter,{provider:'gelato',country:'MX',cursor:result.cursor,refresh:true})
  result=await discoverStudioProducts(adapter,{provider:'gelato',country:'MX',cursor:result.cursor,refresh:true})
  assert.deepEqual(queries,[['posters',0],['canvases',0],['posters',25]])
  assert.equal(result.hasMore,false)
})
