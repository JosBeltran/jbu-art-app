import {test} from 'node:test'
import assert from 'node:assert/strict'
import {artworkPrintSize,matchingArtworkPrint,normalizedPrintSize,PRINT_SIZE_CATALOG} from '../lib/artworkPrintSizes.js'
import {printForm,validatePrintForm,nextPrintForm} from '../lib/printManager.js'

const active={id:'10000000-0000-4000-8000-000000000001',artwork_id:'20000000-0000-4000-8000-000000000001',size:'A2 · 42 × 59.4 cm',size_code:'A2',is_active:true}
const variant={widthMm:420,heightMm:594,attributes:{orientation:'portrait'},printAreas:[{required:true,recommendedDpi:300}]}
test('an active normalized Artwork Print enables a size without any file or revision',()=>{
  assert.equal(matchingArtworkPrint(variant,[active])?.id,active.id)
  assert.equal(matchingArtworkPrint({...variant,widthMm:594,heightMm:841},[active]),null)
  assert.equal(matchingArtworkPrint(variant,[{...active,is_active:false}]),null)
})
test('normalization recognizes existing ISO and physical labels without guessing unknown sizes',()=>{
  for(const [label,code] of [['A2 · 42 × 59.4 cm','A2'],['A3 - papel','A3'],['30 × 40 cm','30X40CM'],['20 × 30 in','20X30IN'],['50x70cm','50X70CM']])
    assert.equal(normalizedPrintSize(label),code)
  assert.equal(normalizedPrintSize('Custom 30 × 40'),null)
  assert.equal(artworkPrintSize({...active,size:'A1'}),'A2')
  assert.equal(artworkPrintSize({...active,size_code:'unknown'}),null)
})
test('reference pinning never switches silently to another print of the same size',()=>{
  const second={...active,id:'10000000-0000-4000-8000-000000000002'}
  assert.equal(matchingArtworkPrint(variant,[second,active])?.id,active.id)
  assert.equal(matchingArtworkPrint(variant,[second,active],null,second.id)?.id,second.id)
  assert.equal(matchingArtworkPrint(variant,[second,{...active,is_active:false}],null,active.id),null)
})
test('dimension tolerance, inches and orientation remain independent of master readiness',()=>{
  assert.equal(matchingArtworkPrint({...variant,widthMm:420.9},[active])?.id,active.id)
  assert.equal(matchingArtworkPrint({...variant,widthMm:422},[active]),null)
  assert.equal(matchingArtworkPrint({...variant,widthMm:594,heightMm:420},[active]),null)
  assert.equal(matchingArtworkPrint(variant,[active],'landscape'),null)
  assert.equal(matchingArtworkPrint({widthMm:304.8,heightMm:406.4},[{...active,size_code:'12X16IN'}])?.id,active.id)
  assert.equal(matchingArtworkPrint({widthMm:300,heightMm:400},[{...active,size_code:'12X16IN'}]),null)
})
test('editing and duplicating preserve the normalized code and validate the allowlist',()=>{
  const row=printForm({...active,title:'Study'})
  assert.equal(row.size_code,'A2')
  assert.equal(nextPrintForm(row,true).size_code,'A2')
  const input={...row,id:active.id,create:false,currency:'MXN',price:100,edition_type:'OPEN',finish:'FINE_ART'}
  assert.equal(validatePrintForm(input).size_code,'A2')
  assert.throws(()=>validatePrintForm({...input,size_code:'arbitrary'}),/invalid_print_size/)
  assert.equal(Object.keys(PRINT_SIZE_CATALOG).length,25)
})

