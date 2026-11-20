import { randomUUID } from 'node:crypto'
import { providerAdapter } from './providers.js'
import { wallArtGroup } from './wallArt.js'
import { nextSupplierOffset, normalizeSupplierEntries, retryDelay } from './supplierCatalog.js'

async function checked(query) {
  const {data,error}=await query
  if(error)throw error
  return data
}

/** One persisted source page per invocation. No provider requests occur in the browsing service. */
export async function advanceSupplierSync(db, provider, adapter=providerAdapter) {
  const token=randomUUID()
  const run=await checked(db.rpc('claim_supplier_catalog_batch',{_provider:provider,_token:token}))
  if(!run)return {idle:true}
  try {
    if(run.pages>=100000)throw Object.assign(new Error('supplier_scan_limit'),{code:'supplier_scan_limit'})
    const client=adapter(provider)
    const checkpoint=structuredClone(run.checkpoint)
    let entries=[]
    let complete=false
    if(!checkpoint.catalogs) {
      const categories=provider==='gelato' ? await client.categories() : [{id:'wall-art',title:'Wall art'}]
      checkpoint.catalogs=[...new Set(categories.filter(row=>/\bwall[- ]art\b/i.test(row.id) || wallArtGroup({externalId:row.id,title:row.title})).map(row=>row.id))]
      if(!checkpoint.catalogs.length)throw Object.assign(new Error('supplier_no_wall_art_catalogs'),{code:'supplier_no_wall_art_catalogs'})
      checkpoint.catalog=0;checkpoint.offset=0;checkpoint.pending=[]
    } else if(checkpoint.pending?.length) {
      const pending=checkpoint.pending[0]
      const product=await client.product(pending.id,{offset:pending.offset,limit:25})
      if(product.externalId!==pending.id)throw Object.assign(new Error('provider_variant_mismatch'),{code:'provider_variant_mismatch'})
      entries=normalizeSupplierEntries(provider,{...product,category:product.category || checkpoint.catalogs[checkpoint.catalog]})
      const next=nextSupplierOffset(product,pending.offset,product.variants.length)
      if(next==null)checkpoint.pending.shift()
      else pending.offset=next
      if(!checkpoint.pending.length && checkpoint.nextSearch==null) {checkpoint.catalog++;checkpoint.offset=0}
      complete=checkpoint.catalog>=checkpoint.catalogs.length
    } else {
      const category=checkpoint.catalogs[checkpoint.catalog]
      const page=await client.search({category,offset:checkpoint.offset,limit:25})
      const next=nextSupplierOffset(page,checkpoint.offset,page.items.length)
      if(provider==='gelato') {
        // Gelato search rows already represent exact manufacturing variants.
        for(const product of page.items) {
          if(!product.variants?.length)throw Object.assign(new Error('supplier_variants_missing'),{code:'supplier_variants_missing'})
          entries.push(...normalizeSupplierEntries(provider,product))
        }
      } else {
        checkpoint.pending=[...new Set(page.items.filter(item=>wallArtGroup(item)).map(item=>item.externalId))].map(id=>({id,offset:0}))
      }
      checkpoint.nextSearch=next
      if(checkpoint.pending.length) { if(next!=null)checkpoint.offset=next }
      else if(next==null) {checkpoint.catalog++;checkpoint.offset=0}
      else checkpoint.offset=next
      complete=checkpoint.catalog>=checkpoint.catalogs.length
    }
    return await checked(db.rpc('commit_supplier_catalog_batch',{_run:run.id,_token:token,_checkpoint:checkpoint,_entries:entries,_complete:complete}))
  } catch(error) {
    const code=['supplier_catalog_empty','supplier_catalog_lease_lost'].includes(error.message) ? error.message : error.code || 'supplier_sync_failed'
    const transient=['provider_unreachable','provider_rate_limited'].includes(code) || code==='provider_rejected' && error.httpStatus>=500
    await checked(db.rpc('fail_supplier_catalog_batch',{_run:run.id,_token:token,_error:code,
      _delay:retryDelay(error,run.attempts),_terminal:!transient}))
    return {revision:run.id,error:code,retry:transient && run.attempts<4}
  }
}

export async function scheduledSupplierSync(db, adapter=providerAdapter) {
  const states=await checked(db.from('supplier_catalog_state').select('*').order('provider_code'))
  const result=[]
  for(const state of states) {
    // Active manual runs are also advanced by the scheduler; scheduling only controls new revisions.
    if(state.schedule_enabled && (!state.next_refresh_at || Date.parse(state.next_refresh_at)<=Date.now()))
      await checked(db.rpc('start_supplier_catalog_sync',{_provider:state.provider_code,_retry:false}))
    result.push({provider:state.provider_code,...await advanceSupplierSync(db,state.provider_code,adapter)})
  }
  return result
}
