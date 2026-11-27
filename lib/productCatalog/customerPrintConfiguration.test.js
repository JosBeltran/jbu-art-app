import test from 'node:test'
import assert from 'node:assert/strict'
import { customerPrintChoices, customerPrintOptions, resolveCustomerPrint, customerPrintLabel, frameProfileFromSku } from './customerPrintConfiguration.js'

function variant(id, size, values = {}, artworkId = 'current', productId = 'poster') {
  return {
    id, artworkId, productId, size, productFamily:'poster',
    attributes:Object.entries(values).map(([code,value])=>({code,value})),
  }
}

const optionValues = (...args) => customerPrintOptions(...args).map(({value})=>value)

test('unframed prints offer real sizes only and normalize ISO size labels',()=>{
  const a1=variant('a1','a1',{paper:'cotton',finish:'none',orientation:'portrait'})
  const a2=variant('a2','A2',{paper:'cotton',finish:'none',orientation:'portrait'})
  assert.deepEqual(customerPrintChoices(a1),{paper:'cotton',framing:'unframed',frame:'unframed',frame_material:'',frame_color:'',size:'A1',orientation:'',border:''})
  assert.deepEqual(optionValues([a1,a2],a1,'size'),['A1','A2'])
  assert.deepEqual(optionValues([a1,a2],a1,'frame'),['unframed'])
  assert.equal(resolveCustomerPrint([a1,a2],a1,'size','A2'),a2)
})

test('dependent choices resolve real variants across parents, preserving compatible size',()=>{
  const wood=variant('wood','A2',{paper:'cotton',frame_material:'wood',frame_color:'black'})
  const aluminumA1=variant('metal-a1','A1',{paper:'cotton',frame_material:'aluminum',frame_color:'white'},'current','metal')
  const aluminumA2=variant('metal-a2','A2',{paper:'cotton',frame_material:'aluminum',frame_color:'white'},'current','metal')
  const silk=variant('silk','A3',{paper:'silk'},'current','silk')
  const rows=[wood,aluminumA1,aluminumA2,silk]
  assert.equal(resolveCustomerPrint(rows,wood,'frame',customerPrintChoices(aluminumA2).frame),aluminumA2)
  assert.equal(resolveCustomerPrint(rows,wood,'paper','silk'),silk)
  assert.equal(resolveCustomerPrint(rows,silk,'frame',customerPrintChoices(wood).frame),wood)
})

test('choices and resolution stay within the exact artwork version',()=>{
  const current=variant('one','A1',{paper:'cotton'})
  const previous=variant('two','A2',{paper:'cotton'},'previous')
  assert.deepEqual(optionValues([current,previous],current,'size'),['A1'])
  assert.equal(resolveCustomerPrint([current,previous],current,'size','A2'),null)
})

test('white margins remain available across orientations',()=>{
  const clean={...variant('plain','A3'),previewGeometry:{widthMm:297,heightMm:420,borderMm:0}}
  const bordered={...variant('bordered','A3'),previewGeometry:{widthMm:297,heightMm:420,borderMm:12}}
  const landscape={...variant('landscape','A3'),previewGeometry:{widthMm:420,heightMm:297,borderMm:12}}
  const rows=[clean,bordered,landscape]
  assert.deepEqual(optionValues(rows,clean,'border'),['0','12'])
  assert.equal(resolveCustomerPrint(rows,clean,'border','12'),bordered)
  assert.equal(resolveCustomerPrint(rows,landscape,'border','0'),clean)
})

test('prepared percent borders remain distinct and preserve their exact IDs when changing size',()=>{
  const rows=['A2','A3'].flatMap(size=>[5,10].map(value=>({
    ...variant(size+'-'+value,size,{paper:'cotton',frame_color:'black'}),
    presentationBorder:{unit:'percent',value},gallery:[{url:'/preview-'+size+'-'+value+'.webp'}],
    previewGeometry:{widthMm:size==='A2'?420:297,heightMm:size==='A2'?594:420,borderMm:0},
  })))
  assert.deepEqual(optionValues(rows,rows[0],'size'),['A2','A3'])
  assert.deepEqual(optionValues(rows,rows[0],'border'),['percent:5','percent:10'])
  const selected=resolveCustomerPrint(rows,rows[0],'border','percent:10')
  assert.equal(selected.id,'A2-10')
  const resized=resolveCustomerPrint(rows,selected,'size','A3')
  assert.equal(resized.id,'A3-10')
  assert.equal(resized.gallery[0].url,'/preview-A3-10.webp')
  assert.equal(resized.previewGeometry.borderMm,0,'The included border must not be applied a second time')
  assert.equal(customerPrintLabel('border',customerPrintChoices(resized).border,(es)=>es),'10 %')
  const mm={...rows[0],id:'mm-10',presentationBorder:{unit:'mm',value:10}}
  assert.deepEqual(optionValues([...rows,mm],rows[0],'border'),['percent:5','percent:10','10'])
  assert.equal(customerPrintLabel('border','10',(es)=>es),'10 mm')
})

test('frame profiles remain distinct and are selectable across papers',()=>{
  const base=variant('black-20','A1',{paper:'cotton',frame_color:'black',frame_material:'wood'})
  const wide={...base,frameProfile:frameProfileFromSku('poster_black_wood_w20xt20-mm_plexiglass')}
  const narrow={...variant('dark-12','A1',{paper:'silk',frame_color:'dark wood',frame_material:'wood'}),
    frameProfile:frameProfileFromSku('poster_dark_wood_w12xt22-mm_plexiglass')}
  const rows=[wide,narrow]
  const key=customerPrintChoices(narrow).frame
  assert.deepEqual(customerPrintOptions(rows,wide,'frame').find(option=>option.value===key),{value:key,compatible:false})
  assert.equal(resolveCustomerPrint(rows,wide,'frame',key),narrow)
  assert.equal(customerPrintLabel('frame',key,es=>es),'Dark Wood · Madera · 12 × 22 mm')
})

test('missing metadata does not create no-frame or no-border options',()=>{
  const unknown={...variant('unknown','A1'),productFamily:undefined}
  assert.deepEqual(optionValues([unknown],unknown,'frame'),[])
  assert.deepEqual(optionValues([unknown],unknown,'border'),[])
  const plain={...variant('plain','A1'),presentationBorder:{unit:'none',value:0}}
  assert.deepEqual(optionValues([unknown,plain],unknown,'frame'),['unframed'])
  assert.deepEqual(optionValues([unknown,plain],unknown,'border'),['0'])
})
