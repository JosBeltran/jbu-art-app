import test from 'node:test'
import assert from 'node:assert/strict'
import { customerPrintChoices, customerPrintOptions, resolveCustomerPrint } from './customerPrintConfiguration.js'

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
