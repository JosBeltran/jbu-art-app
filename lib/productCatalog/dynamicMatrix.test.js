import test from 'node:test'
import assert from 'node:assert/strict'
import {discoverMatrix,matrixCells,matrixConfigurationId,retryDelay,matrixDimensions} from './dynamicMatrix.js'
const row=(id,size,finish)=>({externalId:id,externalVariantId:id,configuration:{},attributes:{size,finish}})
const rows=[row('provider-1','A2','matte'),row('provider-2','A3','matte'),row('provider-3','A4','gloss')]
const page=(offset,candidates,sourceCount=candidates.length,extras={})=>({candidates,schema:{attributes:[{id:'Size',values:candidates.map(row=>({id:row.attributes.size,title:row.attributes.size}))}]},discoveryPage:{offset,sourceCount,sourceIds:candidates.map(row=>row.externalId),...extras}})
test('complete collection probes nonempty short pages, deduplicates overlap and retains exact identities and all option values',async()=>{
  const offsets=[]
  const result=await discoverMatrix({input:{},loadPage:async({offset})=>{offsets.push(offset);return offset===0?page(0,rows.slice(0,2)):offset===2?page(2,[rows[1],rows[2]]):page(4,[])}})
  assert.equal(result.complete,true)
  assert.deepEqual(offsets,[0,2,4])
  assert.equal(result.candidates.length,3)
  assert.deepEqual(result.candidates.map(row=>row.externalVariantId),rows.map(row=>row.externalVariantId))
  assert.deepEqual(result.fields[0].values.map(row=>row.id),['A2','A3','A4'])
  assert.equal(result.candidates[2].discoveryOffset,2)
})
test('failed later page preserves a retryable checkpoint and never claims complete; retry resumes the same offset',async()=>{
  let checkpoint
  const failure=Object.assign(new Error('timeout'),{code:'provider_unreachable'})
  let attempts=0
  await assert.rejects(discoverMatrix({input:{},wait:async()=>{},loadPage:async({offset})=>{if(offset===0)return page(0,[rows[0]]);attempts++;throw failure},onProgress:state=>{checkpoint=state}}),{code:'provider_unreachable'})
  assert.equal(attempts,3)
  assert.equal(failure.checkpoint.complete,false)
  assert.equal(failure.checkpoint.offset,1)
  assert.equal(checkpoint.candidates.length,1)
  const offsets=[]
  const resumed=await discoverMatrix({input:{},checkpoint:failure.checkpoint,loadPage:async({offset})=>{offsets.push(offset);return page(offset,[rows[1]],1,{explicitNext:true,nextOffset:null})}})
  assert.deepEqual(offsets,[1]);assert.equal(resumed.candidates.length,2);assert.equal(resumed.complete,true)
})
test('Retry-After is respected without an unbounded or premature retry',async()=>{
  assert.equal(retryDelay({retryAfter:'120'}),120000)
  assert.equal(retryDelay({retryAfter:'2026-11-20T12:02:00Z'},Date.parse('2026-11-20T12:00:00Z')),120000)
  let calls=0
  await assert.rejects(discoverMatrix({input:{},wait:async()=>{assert.fail('Must not retry early')},loadPage:async()=>{calls++;throw Object.assign(new Error('limit'),{code:'provider_rate_limited',retryAfter:'120'})}}),{code:'provider_rate_limited'})
  assert.equal(calls,1)
})
test('repeated provider pages and non-advancing explicit cursors are incomplete errors',async()=>{
  await assert.rejects(discoverMatrix({input:{},loadPage:async({offset})=>page(offset,[rows[0]])}),{code:'matrix_pagination_stalled'})
  await assert.rejects(discoverMatrix({input:{},loadPage:async()=>page(0,[rows[0]],1,{explicitNext:true,nextOffset:0})}),{code:'matrix_pagination_stalled'})
})
test('matrix distinguishes unsupported and ambiguous cells; selection identities do not depend on axes or filters',()=>{
  const duplicate={...rows[0],externalId:'another-real-id',externalVariantId:'another-real-id'}
  const cells=matrixCells([...rows,duplicate],{rowAxis:'size',columnAxis:'finish'})
  assert.equal(cells.find(cell=>cell.row==='A2' && cell.column==='matte').state,'ambiguous')
  assert.equal(cells.find(cell=>cell.row==='A2' && cell.column==='gloss').state,'unavailable')
  assert.equal(cells.find(cell=>cell.row==='A4' && cell.column==='gloss').state,'available')
  const selection=new Set(rows.map(matrixConfigurationId))
  matrixCells(rows,{rowAxis:'finish',filters:{size:'A2'}})
  assert.equal(selection.size,3)
  assert.deepEqual(matrixDimensions(rows),['size','finish'])
})
test('configuration identity includes exact reported options, not a constructed provider UID',()=>{
  const a={...rows[0],configuration:{frame:'black',glaze:'clear'}}
  assert.equal(matrixConfigurationId(a),matrixConfigurationId({...a,configuration:{glaze:'clear',frame:'black'}}))
  assert.notEqual(matrixConfigurationId(a),matrixConfigurationId({...a,configuration:{frame:'white',glaze:'clear'}}))
})

test('large axis vocabularies use a compact actual-configuration list instead of constructing a huge Cartesian display',()=>{
  const many=Array.from({length:500},(_,index)=>row('real-'+index,'size-'+index,'finish-'+index))
  assert.equal(matrixCells(many,{rowAxis:'size',columnAxis:'finish'}),null)
})
test('contradictory terminal metadata cannot certify completeness',async()=>{
  await assert.rejects(discoverMatrix({input:{},loadPage:async()=>page(0,[rows[0]],1,{explicitNext:true,nextOffset:null,total:10})}),{code:'matrix_pagination_invalid'})
})
test('explicit source continuation is preserved independently of row count and reported option combinations are retained',async()=>{
  const first={...rows[0],configuration:{frame:'black'}}
  const second={...rows[0],configuration:{frame:'white'}}
  const offsets=[]
  const result=await discoverMatrix({input:{},loadPage:async({offset})=>{offsets.push(offset);return offset===0?page(0,[first,second],1,{explicitNext:true,nextOffset:50}):page(50,[rows[2]],1,{explicitNext:true,nextOffset:null})}})
  assert.deepEqual(offsets,[0,50]);assert.equal(result.complete,true);assert.equal(result.candidates.length,3)
})

test('an explicit continuation is followed even when an intermediate source page is empty',async()=>{
  const offsets=[]
  const result=await discoverMatrix({input:{},loadPage:async({offset})=>{offsets.push(offset);return offset===0?page(0,[],0,{explicitNext:true,nextOffset:50}):page(50,[rows[0]],1,{explicitNext:true,nextOffset:null})}})
  assert.deepEqual(offsets,[0,50]);assert.equal(result.complete,true);assert.equal(result.candidates.length,1)
})

test('unreported compatibility is unresolved, never a falsely complete set, and retry revisits its source page',async()=>{
  let failure
  try {await discoverMatrix({input:{},loadPage:async({offset})=>offset===0?{...page(0,[],1),unresolved:1}:page(1,[])})}
  catch(error){failure=error}
  assert.equal(failure.code,'matrix_configurations_unresolved')
  assert.equal(failure.checkpoint.complete,false)
  assert.equal(failure.checkpoint.offset,0)
  const result=await discoverMatrix({input:{},checkpoint:failure.checkpoint,loadPage:async({offset})=>offset===0?page(0,[rows[0]]):page(1,[])})
  assert.equal(result.complete,true)
  assert.equal(result.unresolved,0)
  assert.equal(result.candidates.length,1)
})

test('provider-applied page windows advance by the reported limit even through a short or empty intermediate page',async()=>{
  const offsets=[]
  const result=await discoverMatrix({input:{},loadPage:async({offset})=>{
    offsets.push(offset)
    return offset===0?page(0,[rows[0],rows[1]],2,{advanceBy:25,total:55}):offset===25?page(25,[],0,{advanceBy:25,total:55}):page(50,[rows[2]],1,{advanceBy:25,total:55})
  }})
  assert.deepEqual(offsets,[0,25,50]);assert.equal(result.complete,true);assert.equal(result.candidates.length,3)
})
