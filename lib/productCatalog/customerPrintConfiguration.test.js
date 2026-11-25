import test from 'node:test'
import assert from 'node:assert/strict'
import { customerPrintChoices, customerPrintOptions, resolveCustomerPrint, customerPrintLabel } from './customerPrintConfiguration.js'

function variant(id, size, values = {}, artworkId = 'current', productId = 'poster') {
  return {
    id, artworkId, productId, size,
    attributes:Object.entries(values).map(([code,value])=>({code,value})),
  }
}

test('unframed prints offer real sizes only and normalize ISO size labels',()=>{
  const a1=variant('a1','a1',{paper:'cotton',finish:'none',orientation:'portrait'})
  const a2=variant('a2','A2',{paper:'cotton',finish:'none',orientation:'portrait'})
  assert.deepEqual(customerPrintChoices(a1),{paper:'cotton',framing:'unframed',frame_material:'',frame_color:'',size:'A1',orientation:'',border:''})
  assert.deepEqual(customerPrintOptions([a1,a2],a1,'size'),['A1','A2'])
  assert.deepEqual(customerPrintOptions([a1,a2],a1,'framing'),['unframed'])
  assert.equal(resolveCustomerPrint([a1,a2],a1,'size','A2'),a2)
})

test('dependent choices resolve real variants across parents, preserving compatible size',()=>{
  const wood=variant('wood','A2',{paper:'cotton',frame_material:'wood',frame_color:'black'})
  const aluminumA1=variant('metal-a1','A1',{paper:'cotton',frame_material:'aluminum',frame_color:'white'},'current','metal')
  const aluminumA2=variant('metal-a2','A2',{paper:'cotton',frame_material:'aluminum',frame_color:'white'},'current','metal')
  const silk=variant('silk','A3',{paper:'silk'},'current','silk')
  const rows=[wood,aluminumA1,aluminumA2,silk]
  assert.deepEqual(customerPrintOptions(rows,wood,'frame_color'),['black'])
  assert.equal(resolveCustomerPrint(rows,wood,'frame_material','aluminum'),aluminumA2)
  assert.equal(resolveCustomerPrint(rows,wood,'paper','silk'),silk)
  assert.equal(resolveCustomerPrint(rows,wood,'frame_color','white'),null)
})

test('choices and resolution stay within the exact artwork version',()=>{
  const current=variant('one','A1',{paper:'cotton'})
  const previous=variant('two','A2',{paper:'cotton'},'previous')
  assert.deepEqual(customerPrintOptions([current,previous],current,'size'),['A1'])
  assert.equal(resolveCustomerPrint([current,previous],current,'size','A2'),null)
})

test('white margins and orientation select existing eligible variants only',()=>{
  const clean={...variant('plain','A3'),previewGeometry:{widthMm:297,heightMm:420,borderMm:0}}
  const bordered={...variant('bordered','A3'),previewGeometry:{widthMm:297,heightMm:420,borderMm:12}}
  const landscape={...variant('landscape','A3'),previewGeometry:{widthMm:420,heightMm:297,borderMm:12}}
  const rows=[clean,bordered,landscape]
  assert.deepEqual(customerPrintOptions(rows,clean,'border'),['0','12'])
  assert.equal(resolveCustomerPrint(rows,clean,'border','12'),bordered)
  assert.equal(resolveCustomerPrint(rows,bordered,'orientation','landscape'),landscape)
  assert.equal(resolveCustomerPrint(rows,landscape,'border','0'),null)
})

test('prepared percent borders remain distinct and preserve their exact IDs when changing size',()=>{
  const rows=['A2','A3'].flatMap(size=>[5,10].map(value=>({
    ...variant(size+'-'+value,size,{paper:'cotton',frame_color:'black'}),
    presentationBorder:{unit:'percent',value},gallery:[{url:'/preview-'+size+'-'+value+'.webp'}],
    previewGeometry:{widthMm:size==='A2'?420:297,heightMm:size==='A2'?594:420,borderMm:0},
  })))
  assert.deepEqual(customerPrintOptions(rows,rows[0],'size'),['A2','A3'])
  assert.deepEqual(customerPrintOptions(rows,rows[0],'border'),['percent:5','percent:10'])
  const selected=resolveCustomerPrint(rows,rows[0],'border','percent:10')
  assert.equal(selected.id,'A2-10')
  const resized=resolveCustomerPrint(rows,selected,'size','A3')
  assert.equal(resized.id,'A3-10')
  assert.equal(resized.gallery[0].url,'/preview-A3-10.webp')
  assert.equal(resized.previewGeometry.borderMm,0,'The included border must not be applied a second time')
  assert.equal(customerPrintLabel('border',customerPrintChoices(resized).border,(es)=>es),'10 %')
  const mm={...rows[0],id:'mm-10',presentationBorder:{unit:'mm',value:10}}
  assert.deepEqual(customerPrintOptions([...rows,mm],rows[0],'border'),['percent:5','percent:10','10'])
  assert.equal(customerPrintLabel('border','10',(es)=>es),'10 mm')
})
