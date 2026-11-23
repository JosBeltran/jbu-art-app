import {PRESENTATION_VERSION,presentationCategories,categoryForCatalog,presentationDefinitions,presentationFilters,presentationMatches,configurationFields,normalizeMatrixCandidate,commercialAttributes} from './presentations.js'
import { createHash, randomUUID } from 'node:crypto'
import { HttpError } from '../certificates/adminAuth.server.js'
import { wallArtGroup,wallArtFamilies } from './wallArt.js'
import { studioCountryAllowed } from './studioDiscovery.js'
import { discoverMatrix, matrixCacheKey, matrixSelection } from './dynamicMatrix.js'
import { exactCombinations,matchesAttributes } from './configuration.js'

export const nativeCapabilities={gelato:{attributeSearch:true,destinationCost:true,variantPagination:false,commercialImages:false},
  prodigi:{attributeSearch:false,destinationCost:false,variantPagination:true,commercialImages:false}}
const catalogs={
  posters:['poster','Póster','Poster'], 'fine-art':['fine_art_print','Fine Art','Fine Art'],
  'framed-posters':['framed_print','Póster enmarcado','Framed poster'],
  'mounted-framed-posters':['framed_print','Póster montado y enmarcado','Mounted framed poster'],
  'fine-art-framed-poster':['framed_print','Fine Art enmarcado','Framed Fine Art'],
  canvas:['canvas','Lienzo','Canvas'],'framed-canvas':['framed_canvas','Lienzo enmarcado','Framed canvas'],
  acrylic:['acrylic','Acrílico','Acrylic'],metal:['metal','Metal','Metal'],metallic:['metal','Metal','Metal'],
  aluminium:['metal','Aluminio','Aluminium'],wood:['wood','Madera','Wood'],
}
const checked=async query=>{const {data,error}=await query;if(error)throw error;return data}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const selectionEntries=selection=>Object.entries(selection || {}).filter(([,value])=>value)
const selectionMatches=(variant,selection)=>matchesAttributes(variant.attributes || {},selection)
const candidateDto=(row,binding)=>normalizeMatrixCandidate(Object.fromEntries(['externalId','externalVariantId','sku','title','configuration','attributes','sourceAttributes','countries','widthMm','heightMm','size'].map(key=>[key,row[key]])),binding)
const matrixLoads = new Map()
const err=code=>new HttpError(409,code)

/** Completed discovery matrices share the metadata store. Exact resolution still reads the supplier. */
export function providerNativeService(db,adapter,{now=()=>Date.now()}={}) {
  async function metadata(provider,key,load,{fresh=false,retain=false,ttl=24*3600000}={}) {
    let row
    try {row=await checked(db.from('provider_metadata_cache').select('*').eq('provider_code',provider).eq('cache_key','v1:'+key).maybeSingle())} catch { /* Cache failure must not turn into a required index. */ }
    if(!fresh && row?.schema_version===1 && (retain || Date.parse(row.expires_at)>now()))return {...row.value,cache:{stale:Date.parse(row.expires_at)<=now(),fetchedAt:row.fetched_at,expiresAt:row.expires_at,version:row.fingerprint}}
    try {
      const value=await load()
      const fetchedAt=new Date(now()).toISOString(),expiresAt=new Date(now()+ttl).toISOString(),version=digest(value)
      try {await checked(db.from('provider_metadata_cache').upsert({provider_code:provider,cache_key:'v1:'+key,schema_version:1,value,fingerprint:version,fetched_at:fetchedAt,expires_at:expiresAt}))} catch { /* Live metadata remains usable if the optional cache cannot be written. */ }
      return {...value,cache:{stale:false,fetchedAt,expiresAt,version}}
    } catch(error) {
      if(!fresh && row?.schema_version===1)return {...row.value,cache:{stale:true,fetchedAt:row.fetched_at,expiresAt:row.expires_at,version:row.fingerprint},warning:error.code || 'provider_unreachable'}
      throw error
    }
  }
  async function discover({provider,category,offset=0,country,complete=false,refresh=false}) {
    if(provider==='gelato') {
      const result=await metadata(provider,'catalogs',async()=>({categories:await adapter(provider).categories()}),{fresh:refresh})
      const categories=Object.entries(presentationCategories).flatMap(([id,[family,refs]])=>result.categories.some(row=>refs.includes(row.id))
        ? [{id,titles:wallArtFamilies[family],family}] : [])
      if(!category)return {categories,presentations:[],cache:result.cache,nextOffset:null}
      const rows=result.categories.filter(row=>categoryForCatalog(row.id)===category)
      if (complete) {
        const definitions = await Promise.all(rows.map(async row=>presentationDefinitions(provider,row.id,
          await definition(provider,row.id,{fresh:refresh}))))
        return {categories,presentations:[],presentationCandidates:definitions.flat(),cache:result.cache,nextOffset:null,optionsScope:'pending_complete_configuration_discovery'}
      }
      const presentations=[]
      for(const row of rows) {
        const schema=await definition(provider,row.id,{fresh:refresh})
        const definitions=presentationDefinitions(provider,row.id,schema)
        const cards=await Promise.all(definitions.map(async presentation=>{
          const page=await adapter(provider).search({category:row.id,attributeFilters:presentation.filters,offset:0,limit:25})
          const variants=page.items.flatMap(product=>product.variants.filter(variant=>presentationMatches(presentation,product,variant) &&
            studioCountryAllowed({countries:product.supportedCountries},country)))
          return variants.length ? {...presentation,sizeSummary:[...new Set(variants.map(row=>commercialAttributes(row.attributes,row).size).filter(Boolean))],
            evidence:{scope:'matching_product_page',verifiedCandidates:variants.length,nextOffset:page.nextOffset}} : null
        }))
        presentations.push(...cards.filter(Boolean))
      }
      return {categories,presentations,cache:result.cache,nextOffset:null,optionsScope:'matching_product_page'}
    }
    const result=await metadata(provider,'parents:'+offset,()=>adapter(provider).search({category:'wall-art',offset,limit:5}),{fresh:refresh})
    const parents=result.items.filter(row=>wallArtGroup({category:row.category,title:row.title}))
    const categories=[...new Set(parents.map(row=>wallArtGroup(row)))].map(id=>({id,titles:wallArtFamilies[id] || [id.replaceAll('_',' '),id.replaceAll('_',' ')]}))
    if(!category)return {categories,presentations:[],...(complete ? {presentationCandidates:[],discoveryPage:result.pagination} : {}),nextOffset:result.total!=null && offset+result.items.length>=result.total ? null : result.items.length===5 ? offset+5 : null}
    const groups=await Promise.all(parents.filter(row=>wallArtGroup(row)===category).map(async parent=>{
      const schema=await definition(provider,parent.externalId,{fresh:refresh})
      if(complete)return presentationDefinitions(provider,parent.externalId,schema)
      const product=await adapter(provider).product(parent.externalId,{offset:0,limit:25})
      return presentationDefinitions(provider,parent.externalId,schema).filter(presentation=>
        product.variants.some(variant=>exactCombinations(variant).some(configuration=>presentationMatches(presentation,product,{...variant,configuration}))))
        .map(presentation=>({...presentation,sizeSummary:product.variants.map(row=>row.size).filter(Boolean),evidence:{scope:'matching_product_page'}}))
    }))
    const presentations=groups.flat()
    return {categories,presentations:complete ? [] : presentations,...(complete ? {presentationCandidates:presentations,discoveryPage:result.pagination} : {}),nextOffset:result.total!=null && offset+result.items.length>=result.total ? null : result.items.length===5 ? offset+5 : null}
  }
  async function definition(provider,catalogId,{fresh=false}={}) {
    const value=await metadata(provider,'definition:'+catalogId,()=>adapter(provider).definition(catalogId),{fresh})
    const family=provider==='gelato' ? catalogs[catalogId]?.[0] : wallArtGroup({category:value.category,title:value.title})
    if(!family)throw err('native_presentation_unsupported')
    return {...value,family,capabilities:nativeCapabilities[provider]}
  }
  function validateSelection(definition,selection) {
    for(const [key,value] of selectionEntries(selection)) {
      const attribute=definition.attributes.find(row=>row.id===key)
      if(!attribute || !attribute.values.some(option=>option.id===value))throw err('native_attribute_invalid')
    }
  }
  async function configure({provider,catalogId,presentationId,selection={},offset=0,country}, presetSchema) {
    const schema=presetSchema || await definition(provider,catalogId)
    const presentation=presentationId && presentationDefinitions(provider,catalogId,schema).find(row=>row.id===presentationId)
    if(presentationId && !presentation)throw err('native_presentation_unsupported')
    if(presentation) {
      const fields=configurationFields(schema,presentation)
      if(selectionEntries(selection).some(([key])=>!fields.some(field=>field.id===key)))throw err('native_attribute_invalid')
    }
    if(provider==='gelato' || presentation)validateSelection(schema,selection)
    const client=adapter(provider)
    if(provider==='gelato') {
      const page=await client.search({category:catalogId,attributeFilters:presentation ? presentationFilters(presentation,selection) : Object.fromEntries(selectionEntries(selection).map(([key,value])=>[key,[value]])),offset,limit:25})
      const candidates=page.items.flatMap(product=>product.variants.filter(variant=>selectionMatches(variant,selection) && (!presentation || presentationMatches(presentation,product,variant))).map(variant=>({
        externalId:product.externalId,externalVariantId:variant.externalVariantId,sku:variant.sku,configuration:{},
        ...variant,sourceAttributes:variant.attributes,countries:product.supportedCountries || [],
      }))).filter(variant=>studioCountryAllowed(variant,country)).map(row=>candidateDto(row,{provider,catalogId,presentationId}))
      const available=(presentation ? configurationFields(schema,presentation) : schema.attributes).map(attribute=>({...attribute,fixed:attribute.values.length===1,values:attribute.values.filter(value=>
        presentation ? candidates.some(row=>row.sourceAttributes[attribute.id]===value.id) : !page.attributeHits?.[attribute.id] || page.attributeHits[attribute.id][value.id]>0)}))
      return {schema:{...schema,attributes:available},...(presentation ? {presentation,technical:{attributes:schema.attributes,catalogId,definitionVersion:schema.cache.version},incompatibleOptions:candidates.length ? [] : selectionEntries(selection).map(([key])=>key)} : {}),
        candidates,discoveryPage:page.pagination,sourceAttributes:schema.attributes,nextOffset:page.nextOffset ?? null,optionsScope:presentation ? 'matching_product_page' : 'filtered_catalog',availability:'supplier_reported_or_unknown'}
    }
    const product=await client.product(catalogId,{offset,limit:25})
    const observed={}
    for(const raw of product.variants) {
      for(const [key,value] of Object.entries(raw.attributes || {}))if(typeof value==='string')(observed[key] ||= new Set()).add(value)
      for(const [key,values] of Object.entries(raw.options || {}))if(Array.isArray(values))for(const value of values)(observed[key] ||= new Set()).add(value)
      for(const combo of exactCombinations(raw))for(const [key,value] of Object.entries(combo))(observed[key] ||= new Set()).add(value)
    }
    const definitions=new Map(schema.attributes.map(row=>[row.id,row]))
    for(const [key,values] of Object.entries(observed))if(!definitions.has(key))definitions.set(key,{id:key,title:key,values:[...values].map(value=>({id:value,title:value}))})
    const sourceSchema={...schema,attributes:[...definitions.values()]}
    const candidates=product.variants.flatMap(variant=>exactCombinations(variant).map(configuration=>({
      ...variant,externalId:product.externalId,configuration,sourceAttributes:{...variant.attributes,...configuration},
    }))).filter(variant=>selectionMatches({attributes:variant.sourceAttributes},selection) && (!presentation || presentationMatches(presentation,product,{attributes:variant.sourceAttributes})) && studioCountryAllowed(variant,country)).map(row=>candidateDto(row,{provider,catalogId,presentationId}))
    return {schema:{...schema,attributes:presentation ? configurationFields(sourceSchema,presentation).map(field=>({...field,fixed:field.values.length===1,values:field.values.filter(value=>candidates.some(row=>row.sourceAttributes[field.id]===value.id))})) : sourceSchema.attributes},...(presentation ? {presentation,technical:{attributes:sourceSchema.attributes,catalogId,definitionVersion:schema.cache.version},incompatibleOptions:candidates.length ? [] : selectionEntries(selection).map(([key])=>key)} : {}),candidates,discoveryPage:product.pagination,unresolved:product.variants.filter(row=>Object.keys(row.options || {}).length && !row.combinations?.length).length,nextOffset:product.total!=null ? offset+product.variants.length<product.total ? offset+product.variants.length : null
      : product.variants.length===25 ? offset+25 : null,optionsScope:'current_variant_page',availability:'unverified_regions'}
  }
  async function resolve({provider,catalogId,presentationId,externalId,variantId,selection={},configuration={},offset=0,country}) {
    // Never resolve compatibility from a stale metadata fallback.
    const schema=await definition(provider,catalogId,{fresh:true})
    const presentation=presentationId && presentationDefinitions(provider,catalogId,schema).find(row=>row.id===presentationId)
    if(presentationId && !presentation)throw err('native_presentation_unsupported')
    if(presentation) {
      const fields=configurationFields(schema,presentation)
      if(selectionEntries(selection).some(([key])=>!fields.some(field=>field.id===key)))throw err('native_attribute_invalid')
    }
    if(provider==='gelato' || presentation)validateSelection(schema,selection)
    const client=adapter(provider)
    let product
    if(provider==='gelato') {
      const page=await client.search({category:catalogId,attributeFilters:presentation ? presentationFilters(presentation,selection) : Object.fromEntries(selectionEntries(selection).map(([key,value])=>[key,[value]])),offset,limit:25})
      if(!page.items.some(row=>row.externalId===externalId))throw err('native_configuration_changed')
      const searched=page.items.find(row=>row.externalId===externalId)
      product=await client.product(externalId)
      product={...product,variants:product.variants.map(raw=>{
        const dimensions=searched.variants.find(row=>row.externalVariantId===raw.externalVariantId)
        return {...raw,widthMm:raw.widthMm || dimensions?.widthMm || null,heightMm:raw.heightMm || dimensions?.heightMm || null}
      })}
    } else product=await client.product(catalogId,{offset,limit:25})
    if(product.externalId!==externalId || product.rawMetadata?.isPrintable===false)throw err('provider_variant_mismatch')
    const raw=product.variants.find(row=>row.externalVariantId===variantId)
    if(!raw || !selectionMatches({attributes:{...raw.attributes,...configuration}},selection) ||
      !exactCombinations(raw).some(option=>JSON.stringify(Object.entries(option).sort())===JSON.stringify(Object.entries(configuration).sort())))throw err('native_configuration_invalid')
    const countries=provider==='gelato' ? product.supportedCountries || [] : raw.countries || []
    if(!studioCountryAllowed({countries},country))throw err('provider_variant_unavailable')
    if(presentation && !presentationMatches(presentation,product,{...raw,configuration}))throw err('native_presentation_mismatch')
    const variant={...raw,countries}
    return {product:{...product,category:provider==='gelato' ? catalogId : product.category,variants:[variant]},variant,
      snapshot:{mode:'native_v1',groupKey:presentation ? presentation.id : 'native:'+provider+':'+catalogId,family:schema.family,catalogId,selection,
        configuration,variant,discoveryOffset:offset,presentation:presentation || {provider,catalogId,family:schema.family},attributeDefinitions:schema.attributes.map(({id,title})=>({id,title})),resolvedAt:new Date(now()).toISOString(),definitionVersion:schema.cache.version}}
  }
  async function verifyMatrixSelections(items) {
    const schemas=new Map()
    const definitionFor=item=>{
      const key=item.provider+':'+item.snapshot.catalogId
      if(!schemas.has(key))schemas.set(key,definition(item.provider,item.snapshot.catalogId,{fresh:true}))
      return schemas.get(key)
    }
    for(let start=0;start<items.length;start+=4)await Promise.all(items.slice(start,start+4).map(async item=>{
      const snapshot=item.snapshot,schema=await definitionFor(item)
      const presentation=presentationDefinitions(item.provider,snapshot.catalogId,schema).find(row=>row.id===snapshot.presentation.id)
      if(!presentation)throw err('native_presentation_unsupported')
      const product=await adapter(item.provider).product(item.externalId,{offset:snapshot.discoveryOffset || 0,limit:25})
      const raw=product.variants.find(row=>row.externalVariantId===item.variantId)
      const configuration=item.configuration || {}
      if(product.externalId!==item.externalId || product.rawMetadata?.isPrintable===false || !raw ||
        !matchesAttributes({...raw.attributes,...configuration},snapshot.variant.attributes || {}) ||
        ['widthMm','heightMm'].some(key=>raw[key]>0 && snapshot.variant[key]>0 && Math.abs(raw[key]-snapshot.variant[key])>0.01) ||
        !exactCombinations(raw).some(option=>JSON.stringify(Object.entries(option).sort())===JSON.stringify(Object.entries(configuration).sort())) ||
        !presentationMatches(presentation,product,{...raw,configuration}) ||
        !studioCountryAllowed({countries:item.provider==='gelato' ? product.supportedCountries : raw.countries},item.country))throw err('native_configuration_changed')
    }))
  }
  async function nativeMatrixSnapshot({refresh=false,resume=false,...input}) {
    input.selection=matrixSelection(input.selection)
    const schema=await definition(input.provider,input.catalogId)
    const identity=matrixCacheKey(input)
    const key='v1:complete-matrix:'+digest([PRESENTATION_VERSION,identity,schema.cache.version])
    const pendingKey=key.replace('complete-matrix','pending-matrix')
    const leaseKey=key.replace('complete-matrix','lease-matrix')
    const read=async cacheKey=>checked(db.from('provider_metadata_cache').select('*')
      .eq('provider_code',input.provider).eq('cache_key',cacheKey).maybeSingle())
    const write=async (cacheKey,matrix,ttl)=>{
      const time=now()
      const row={
        provider_code:input.provider,cache_key:cacheKey,schema_version:1,value:{matrix},
        fingerprint:digest({matrix}),fetched_at:new Date(time).toISOString(),expires_at:new Date(time+ttl).toISOString(),
      }
      await checked(db.from('provider_metadata_cache').upsert(row))
      return row
    }
    const usable=row=>row?.schema_version===1 && row.value?.matrix?.complete===true &&
      row.value.matrix.presentation?.version===PRESENTATION_VERSION &&
      row.value.matrix.technical?.definitionVersion===schema.cache.version
    const reply=(row,stale=false)=>({...row.value,
      matrix:{...row.value.matrix,candidates:row.value.matrix.candidates.map(candidate=>normalizeMatrixCandidate(candidate,input))},cache:{
      stale,fetchedAt:row.fetched_at,expiresAt:row.expires_at,version:row.fingerprint,
    }})
    // The existing in-process request is shared across service instances on this worker.
    const requestKey=JSON.stringify([key,refresh,resume])
    const loading=matrixLoads.get(requestKey)
    if(loading)return loading
    const load=(async()=>{
      async function readComplete() {
        let stored=await read(key)
        if(!stored && !Object.keys(input.selection).length) {
          const legacyIdentity=JSON.stringify([input.provider,input.catalogId,input.presentationId,input.country])
          stored=await read('v1:complete-matrix:'+digest(legacyIdentity))
        }
        return stored
      }
      let stored=await readComplete()
      if(!refresh && !resume && usable(stored) && Date.parse(stored.expires_at)>now())return reply(stored)
      const previousLease=await read(leaseKey)
      if(previousLease && Date.parse(previousLease.expires_at)>now())return {pending:true,busy:true}
      const token=randomUUID()
      const lease={provider_code:input.provider,cache_key:leaseKey,schema_version:1,value:{},fingerprint:token,
        fetched_at:new Date(now()).toISOString(),expires_at:new Date(now()+75_000).toISOString()}
      const claim=previousLease
        ? db.from('provider_metadata_cache').update(lease).eq('provider_code',input.provider).eq('cache_key',leaseKey).eq('fingerprint',previousLease.fingerprint)
        : db.from('provider_metadata_cache').upsert(lease,{onConflict:'provider_code,cache_key',ignoreDuplicates:true})
      if(!await checked(claim.select('fingerprint').maybeSingle()))return {pending:true,busy:true}
      let progress
      try {
        stored=await readComplete()
        const pending=refresh ? null : await read(pendingKey)
        const checkpoint=pending?.schema_version===1 && Date.parse(pending.expires_at)>now() ? pending.value.matrix : undefined
        if(!refresh && !checkpoint && usable(stored) && Date.parse(stored.expires_at)>now())return reply(stored)
        progress=checkpoint
        const matrix=await discoverMatrix({input,checkpoint,maxPages:3,signal:AbortSignal.timeout(35_000),
          loadPage:page=>configure(page,schema),onProgress:value=>{if(!value.retrying)progress=value}})
        if(!matrix.complete) {
          await write(pendingKey,matrix,15*60000)
          return {pending:true,progress:{pages:matrix.pages}}
        }
        const saved=await write(key,matrix,6*3600000)
        // An expired marker supersedes a checkpoint without requiring delete privileges.
        await write(pendingKey,null,0).catch(()=>{})
        return reply(saved)
      } catch(error) {
        const checkpoint=error.checkpoint || progress
        if(checkpoint?.pages && !checkpoint.complete)await write(pendingKey,checkpoint,15*60000).catch(()=>{})
        if(!refresh && !resume && usable(stored) &&
          ['provider_unreachable','provider_rate_limited'].includes(error.code))return reply(stored,true)
        if (error.code?.startsWith('matrix_')) throw err(error.code)
        throw error
      } finally {
        await checked(db.from('provider_metadata_cache').update({expires_at:new Date(now()).toISOString()})
          .eq('provider_code',input.provider).eq('cache_key',leaseKey).eq('fingerprint',token)).catch(()=>{})
      }
    })()

    matrixLoads.set(requestKey,load)
    try {return await load} finally {matrixLoads.delete(requestKey)}
  }
  return {verifyMatrixSelections,nativeMatrixSnapshot,nativeDiscover:discover,nativeDefinition:({provider,catalogId})=>definition(provider,catalogId),nativeConfigure:configure,nativeResolve:resolve}
}
