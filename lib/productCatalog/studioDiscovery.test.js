import assert from 'node:assert/strict'
import test from 'node:test'
import { gelatoSeries, matchingStudioVariants, mergeStudioGroups, studioGroup, studioProductTitle, studioVariantKey } from './studioDiscovery.js'
import { studioProductVariants } from './studioDiscovery.server.js'
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

test('framed product titles distinguish the shared paper and color without using the selected size',()=>{
  const framed=(size,paper,frame_color)=>({group:'framed_print',variant:{attributes:{size,paper,frame_color}}})
  const fineArt=framed('A1','200-gsm-80lb-enhanced-uncoated','natural-wood')
  const archival=framed('A1','250-gsm-uncoated-offwhite-archival','black')
  const title=studioProductTitle('La Silla del Cantor','Fine Art enmarcado · Madera',[fineArt],0)
  assert.match(title,/Fine Art enmarcado.*200 g\/m².*Marco madera natural/)
  assert.match(studioProductTitle('La Silla del Cantor','Póster enmarcado · Madera',[archival],0),
    /Póster enmarcado.*250 g\/m² archival blanco cálido.*Marco negro/)
  const mixed=[fineArt,framed('A2','200-gsm-80lb-enhanced-uncoated','black')]
  assert.doesNotMatch(studioProductTitle('Obra','Fine Art enmarcado',mixed,0),/Marco madera natural|A1|A2/)
})
