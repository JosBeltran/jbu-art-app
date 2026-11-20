import test from 'node:test'
import assert from 'node:assert/strict'
import {supplierIndexService,indexedCandidate} from './supplierIndex.server.js'
const revision='10000000-0000-4000-8000-000000000003'
function database(tables,browse) {
  const calls=[]
  return {calls,async rpc(name,input){calls.push({name,input});return {data:browse}},from(name){
    const filters={};const query={}
    for(const method of ['select','order','range','limit','single','maybeSingle'])query[method]=()=>query
    query.eq=(key,value)=>{filters[key]=value;return query}
    query.in=(key,value)=>{filters[key]=value;return query}
    query.then=resolve=>{calls.push({name,filters});return Promise.resolve({data:typeof tables[name]==='function' ? tables[name](filters) : tables[name]}).then(resolve)}
    return query
  }}
}
test('discovery and exact configuration resolve from the index without invoking any provider adapter',async()=>{
  const variant={externalVariantId:'exact',sku:'REAL',attributes:{Paper:'cotton'},countries:['MX']}
  const db=database({supplier_catalog_groups:{group_key:'group'},supplier_catalog_entries:[{external_id:'parent',variant}],
    supplier_catalog_image_permissions:[{provider_code:'gelato',image_url:'https://supplier.example/licensed.jpg',permission_reference:'Written permission'}]},
    {total:1,groups:[{group_key:'group',family:'poster',provider_code:'gelato',revision,variant_count:1,
      metadata:{titles:['Póster','Poster'],descriptions:['Algodón','Cotton'],images:[{url:'https://supplier.example/licensed.jpg'}],image:{image_url:'https://supplier.example/licensed.jpg',permission_reference:'Written permission'}}}]})
  let requests=0
  const service=supplierIndexService(db,()=>{requests++;throw new Error('live calls forbidden')})
  const products=await service.studioDiscover({provider:'gelato',country:'MX',query:'cotton',offset:12})
  assert.equal(products.groups[0].metadata.image.permission_reference,'Written permission')
  assert.equal(db.calls[0].input._offset,12)
  assert.equal(db.calls.some(call=>call.name==='supplier_catalog_image_permissions'),false)
  const options=await service.studioVariants({provider:'gelato',groupKey:'group',revision,country:'MX'})
  assert.equal(options.variants[0].externalId,'parent')
  assert.equal(options.variants[0].externalVariantId,'exact')
  assert.equal(options.variants[0].attributes.paper,'cotton')
  assert.equal(requests,0)
})
test('fresh candidates reject obsolete revisions and preserve exact indexed identity',async()=>{
  const db=database({supplier_catalog_state:{active_revision:revision},supplier_catalog_entries:{product:{externalId:'parent'},
    variant:{externalVariantId:'exact',sku:'EXACT'},group_key:'group',family:'poster'}})
  const input={provider:'gelato',externalId:'parent',variantId:'exact',groupKey:'group',revision}
  const candidate=await indexedCandidate(db,input)
  assert.equal(candidate.snapshot.variant.sku,'EXACT')
  assert.equal(candidate.snapshot.revision,revision)
  await assert.rejects(indexedCandidate(db,{...input,revision:'old'}),error=>error.status===409 && error.code==='supplier_revision_changed')
})

test('status distinguishes a due queued run, persisted backoff and an active lease from historical errors',async()=>{
  const {supplierRunReadiness}=await import('./supplierIndex.server.js')
  const now=Date.parse('2026-11-20T12:00:00Z')
  const run={status:'queued',errors:4,last_error:'provider_unreachable',next_attempt_at:'2026-11-20T11:59:00Z'}
  assert.equal(supplierRunReadiness(run,now),'ready_for_worker')
  assert.equal(supplierRunReadiness({...run,next_attempt_at:'2026-11-20T12:01:00Z'},now),'backoff')
  assert.equal(supplierRunReadiness({...run,status:'running',lease_until:'2026-11-20T12:01:00Z'},now),'leased')
  assert.equal(supplierRunReadiness({...run,status:'running',lease_until:'2026-11-20T11:59:00Z'},now),'ready_for_worker')
})

test('status exposes unique staged variants separately from the 490 legacy batch counter and active catalog',async()=>{
  const run={id:revision,provider_code:'gelato',status:'queued',pages:490,errors:4,attempts:0,
    next_attempt_at:'1970-01-01T00:00:00Z',checkpoint:{catalog:0,offset:12225},last_error:'provider_unreachable'}
  const db={from(table) {
    let head=false
    const query={select(_columns,options){head=options?.head;return query},eq(){return query},order(){return query},limit(){return query},
      then(resolve){return Promise.resolve(head ? {data:null,count:12000} : {data:table==='supplier_catalog_state'
        ? [{provider_code:'gelato',active_revision:null,last_success_at:null,last_worker_at:null}] : [run]}).then(resolve)}}
    return query
  }}
  const [status]=await supplierIndexService(db,()=>{throw new Error('status must not call the supplier')}).supplierSyncStatus()
  assert.equal(status.run.pages,490)
  assert.equal(status.run.indexedVariants,12000)
  assert.equal(status.run.readiness,'ready_for_worker')
  assert.equal(status.active,null)
  assert.deepEqual(status.run.checkpoint,run.checkpoint)
})
