import { HttpError } from '../certificates/adminAuth.server.js'
import { studioCountryAllowed } from './studioDiscovery.js'
import { studioProductVariants } from './studioDiscovery.server.js'
import { advanceSupplierSync } from './supplierSync.server.js'

export function supplierRunReadiness(run,now=Date.now()) {
  if(!run)return 'not_started'
  if(['failed','complete'].includes(run.status))return run.status
  if(run.lease_until && Date.parse(run.lease_until)>now)return 'leased'
  if(Date.parse(run.next_attempt_at)>now)return 'backoff'
  return 'ready_for_worker'
}

const checked=async query=>{const {data,error}=await query;if(error)throw error;return data}
export function supplierIndexService(db,adapter) {
  return {
    async supplierSyncStatus() {
      const states=await checked(db.from('supplier_catalog_state').select('*').order('provider_code'))
      return Promise.all(states.map(async state=>{
        const columns='id,provider_code,status,created_at,completed_at,stats,pages,errors,last_error,next_attempt_at,attempts,checkpoint,lease_until,last_error_details'
        const [latest,active]=await Promise.all([
          checked(db.from('supplier_catalog_runs').select(columns).eq('provider_code',state.provider_code).order('created_at',{ascending:false}).limit(1)),
          state.active_revision ? checked(db.from('supplier_catalog_runs').select(columns).eq('id',state.active_revision).single()) : null,
        ])
        const run=latest[0]
        let indexedVariants=null
        if(run) {
          const result=await db.from('supplier_catalog_entries').select('external_variant_id',{count:'exact',head:true}).eq('revision',run.id)
          if(result.error)throw result.error
          indexedVariants=result.count
        }
        return {...state,scheduled_new_runs_enabled:process.env.SUPPLIER_CATALOG_START_SCHEDULED_RUNS==='true',run:run ? {...run,indexedVariants,readiness:supplierRunReadiness(run)} : null,active}
      }))
    },
    async supplierSyncStart({provider,retry=false}) {
      return {id:await checked(db.rpc('start_supplier_catalog_sync',{_provider:provider,_retry:retry}))}
    },
    supplierSyncAdvance: ({provider})=>advanceSupplierSync(db,provider,adapter),
    async supplierSyncSchedule({provider,enabled,intervalHours}) {
      return checked(db.from('supplier_catalog_state').update({schedule_enabled:enabled,interval_hours:intervalHours,
        next_refresh_at:enabled ? new Date(Date.now()+intervalHours*3600000).toISOString() : null})
        .eq('provider_code',provider).select().single())
    },
    async studioDiscover({provider,country,query='',family='',offset=0,sort='title'}) {
      const result=await checked(db.rpc('browse_supplier_catalog',{_provider:provider,_country:country,_query:query,_family:family,_offset:offset,_limit:12,_sort:sort}))
      return {...result,groups:result.groups.map(row=>({id:row.group_key,group:row.family,provider:row.provider_code,
        revision:row.revision,externalId:row.group_key,metadata:row.metadata,variantCount:row.variant_count,
        titles:row.metadata.titles,description:row.metadata.descriptions[0],variants:[]}))}
    },
    async studioVariants({provider,groupKey,revision,offset=0,country}) {
      const group=await checked(db.from('supplier_catalog_groups').select('group_key').eq('revision',revision).eq('group_key',groupKey).eq('provider_code',provider).maybeSingle())
      if(!group)throw new HttpError(409,'supplier_revision_unavailable')
      const rows=await checked(db.from('supplier_catalog_entries').select('external_id,variant')
        .eq('revision',revision).eq('provider_code',provider).eq('group_key',groupKey)
        .order('external_id').order('external_variant_id').range(offset,offset+249))
      const variants=rows.flatMap(row=>studioProductVariants({externalId:row.external_id,variants:[row.variant],total:1},0).variants)
        .filter(row=>studioCountryAllowed(row,country))
        .map(({externalId,externalVariantId,sku,title,attributes,configuration,countries,widthMm,heightMm,size,sizeCode})=>({externalId,externalVariantId,sku,title,attributes,configuration,countries,widthMm,heightMm,size,sizeCode}))
      const unresolved=rows.filter(row=>Object.keys(row.variant.options || {}).length && !row.variant.combinations?.length).length
      return {variants,unresolved,nextOffset:rows.length===250 ? offset+250 : null,revision}
    },
  }
}

export async function indexedCandidate(db,{provider,externalId,variantId,groupKey,revision}) {
  const state=await checked(db.from('supplier_catalog_state').select('active_revision').eq('provider_code',provider).single())
  // Previously selected candidates stay pinned. A fresh selection must be from the current complete revision.
  if(state.active_revision!==revision)throw new HttpError(409,'supplier_revision_changed')
  const row=await checked(db.from('supplier_catalog_entries').select('product,variant,group_key,family')
    .eq('revision',revision).eq('provider_code',provider).eq('group_key',groupKey)
    .eq('external_id',externalId).eq('external_variant_id',variantId).maybeSingle())
  if(!row)throw new HttpError(400,'provider_variant_mismatch')
  return {product:{...row.product,variants:[row.variant]},snapshot:{variant:row.variant,groupKey:row.group_key,family:row.family,revision}}
}
