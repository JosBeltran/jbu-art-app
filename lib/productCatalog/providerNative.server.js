import { createHash } from 'node:crypto'
import { HttpError } from '../certificates/adminAuth.server.js'
import { wallArtGroup } from './wallArt.js'
import { describeStudioVariant,studioCountryAllowed } from './studioDiscovery.js'
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
const candidateDto=row=>Object.fromEntries(['externalId','externalVariantId','sku','title','configuration','attributes','sourceAttributes','countries','widthMm','heightMm','size'].map(key=>[key,row[key]]))
const err=code=>new HttpError(409,code)

/** Cache stores definitions only. Search, availability, resolution and costs always read the provider. */
export function providerNativeService(db,adapter,{now=()=>Date.now()}={}) {
  async function metadata(provider,key,load,{fresh=false}={}) {
    let row
    try {row=await checked(db.from('provider_metadata_cache').select('*').eq('provider_code',provider).eq('cache_key','v1:'+key).maybeSingle())} catch { /* Cache failure must not turn into a required index. */ }
    if(!fresh && row?.schema_version===1 && Date.parse(row.expires_at)>now())return {...row.value,cache:{stale:false,fetchedAt:row.fetched_at,expiresAt:row.expires_at,version:row.fingerprint}}
    try {
      const value=await load()
      const fetchedAt=new Date(now()).toISOString(),expiresAt=new Date(now()+24*3600000).toISOString(),version=digest(value)
      try {await checked(db.from('provider_metadata_cache').upsert({provider_code:provider,cache_key:'v1:'+key,schema_version:1,value,fingerprint:version,fetched_at:fetchedAt,expires_at:expiresAt}))} catch { /* Live metadata remains usable if the optional cache cannot be written. */ }
      return {...value,cache:{stale:false,fetchedAt,expiresAt,version}}
    } catch(error) {
      if(!fresh && row?.schema_version===1)return {...row.value,cache:{stale:true,fetchedAt:row.fetched_at,expiresAt:row.expires_at,version:row.fingerprint},warning:error.code || 'provider_unreachable'}
      throw error
    }
  }
  async function discover({provider,offset=0}) {
    if(provider==='gelato') {
      const result=await metadata(provider,'catalogs',async()=>({categories:await adapter(provider).categories()}))
      return {presentations:result.categories.flatMap(row=>catalogs[row.id] ? [{id:'native:gelato:'+row.id,catalogId:row.id,provider,
        group:catalogs[row.id][0],titles:catalogs[row.id].slice(1),supplierTitle:row.title}] : []),cache:result.cache,nextOffset:null}
    }
    const result=await adapter(provider).search({category:'wall-art',offset,limit:25})
    return {presentations:result.items.flatMap(row=>{
      const group=wallArtGroup({category:row.category,title:row.title})
      return group ? [{id:'native:prodigi:'+row.externalId,catalogId:row.externalId,provider,group,titles:[row.title,row.title],supplierTitle:row.title}] : []
    }),nextOffset:result.total!=null ? offset+result.items.length<result.total ? offset+result.items.length : null : result.items.length===25 ? offset+25 : null}
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
  async function configure({provider,catalogId,selection={},offset=0,country}) {
    const schema=await definition(provider,catalogId)
    if(provider==='gelato')validateSelection(schema,selection)
    const client=adapter(provider)
    if(provider==='gelato') {
      const page=await client.search({category:catalogId,attributeFilters:Object.fromEntries(selectionEntries(selection).map(([key,value])=>[key,[value]])),offset,limit:25})
      const candidates=page.items.flatMap(product=>product.variants.filter(variant=>selectionMatches(variant,selection)).map(variant=>({
        externalId:product.externalId,externalVariantId:variant.externalVariantId,sku:variant.sku,configuration:{},
        ...variant,attributes:describeStudioVariant(variant),sourceAttributes:variant.attributes,countries:product.supportedCountries || [],
      }))).filter(variant=>studioCountryAllowed(variant,country)).map(candidateDto)
      const available=schema.attributes.map(attribute=>({...attribute,values:attribute.values.filter(value=>
        !page.attributeHits?.[attribute.id] || page.attributeHits[attribute.id][value.id]>0)}))
      return {schema:{...schema,attributes:available},candidates,nextOffset:page.nextOffset ?? null,optionsScope:'filtered_catalog',availability:'supplier_reported_or_unknown'}
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
    const candidates=product.variants.flatMap(variant=>exactCombinations(variant).map(configuration=>({
      ...variant,externalId:product.externalId,configuration,sourceAttributes:{...variant.attributes,...configuration},
      attributes:describeStudioVariant({...variant,attributes:{...variant.attributes,...configuration}}),
    }))).filter(variant=>selectionMatches({attributes:variant.sourceAttributes},selection) && studioCountryAllowed(variant,country)).map(candidateDto)
    return {schema:{...schema,attributes:[...definitions.values()]},candidates,unresolved:product.variants.filter(row=>Object.keys(row.options || {}).length && !row.combinations?.length).length,nextOffset:product.total!=null ? offset+product.variants.length<product.total ? offset+product.variants.length : null
      : product.variants.length===25 ? offset+25 : null,optionsScope:'current_variant_page',availability:'unverified_regions'}
  }
  async function resolve({provider,catalogId,externalId,variantId,selection={},configuration={},offset=0,country}) {
    // Never resolve compatibility from a stale metadata fallback.
    const schema=await definition(provider,catalogId,{fresh:true})
    if(provider==='gelato')validateSelection(schema,selection)
    const client=adapter(provider)
    let product
    if(provider==='gelato') {
      const page=await client.search({category:catalogId,attributeFilters:Object.fromEntries(selectionEntries(selection).map(([key,value])=>[key,[value]])),offset,limit:25})
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
    const variant={...raw,countries}
    return {product:{...product,category:provider==='gelato' ? catalogId : product.category,variants:[variant]},variant,
      snapshot:{mode:'native_v1',groupKey:'native:'+provider+':'+catalogId,family:schema.family,catalogId,selection,
        configuration,variant,presentation:{provider,catalogId,family:schema.family},attributeDefinitions:schema.attributes.map(({id,title})=>({id,title})),resolvedAt:new Date(now()).toISOString(),definitionVersion:schema.cache.version}}
  }
  return {nativeDiscover:discover,nativeDefinition:({provider,catalogId})=>definition(provider,catalogId),nativeConfigure:configure,nativeResolve:resolve}
}
