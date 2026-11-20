import { studioCapabilities, studioCountryAllowed, studioGroup, mergeStudioGroups, describeStudioVariant } from './studioDiscovery.js'
import { wallArtGroup } from './wallArt.js'

const lifetime = 5 * 60_000
const pageSize = 25
const cache = new Map()
const pendingLoads = new Map()
const cooldowns = new Map()

async function cached(key, refresh, load) {
  const previous = cache.get(key)
  if (!refresh && previous?.until > Date.now()) return previous.value
  const provider=key.split(':')[0]
  const cooldown=cooldowns.get(provider)
  if(cooldown?.until>Date.now())throw cooldown.error
  if(pendingLoads.has(key))return pendingLoads.get(key)
  const pending=Promise.resolve().then(load)
  pendingLoads.set(key,pending)
  try {
    const value=await pending
    cache.delete(key)
    cache.set(key,{value,until:Date.now()+lifetime})
    if(cache.size>160)cache.delete(cache.keys().next().value)
    return value
  } catch(error){
    if(error.code==='provider_rate_limited'){
      const seconds=Number(error.retryAfter)
      const until=Number.isFinite(seconds) && seconds>0 ? Date.now()+seconds*1000 : Date.parse(error.retryAfter)
      cooldowns.set(provider,{error,until:Number.isFinite(until)&&until>Date.now()?until:Date.now()+5000})
    }
    throw error
  } finally {pendingLoads.delete(key)}
}

export async function discoverStudioProducts(adapter, { provider, country, cursor = {}, refresh = false }) {
  const providers = provider === 'all' ? Object.keys(studioCapabilities) : [provider]
  const responses = await Promise.all(providers.map(async name => {
    const current = cursor[name] || { catalog:0,offset:0 }
    if (current.done) return { name,groups:[],cursor:current }
    let warning
    try {
      const client = adapter(name)
      let catalogIds = ['wall-art'] // Prodigi's published parent category includes descendants.
      if (studioCapabilities[name].groupFromVariants) {
        try {
          const categories = await cached(name+':categories', refresh, () => client.categories())
          catalogIds = categories.filter(row => /\bwall[- ]art\b/i.test(row.id) ||
            wallArtGroup({externalId:row.id,title:row.title})).map(row=>row.id)
        } catch (error) {
          if (![ 'gelato_catalog_invalid_id','gelato_catalog_invalid_list','gelato_catalog_invalid_json' ].includes(error.code)) throw error
          warning = error.code
          catalogIds = ['posters']
        }
      }
      const categoryLimit = catalogIds.length > 24
      catalogIds = current.catalogs || [...new Set(catalogIds)].slice(0,24)
      const pending = current.pending || catalogIds.map((_,catalog)=>({catalog,offset:0})).filter(position=>position.catalog>current.catalog)
      const id = catalogIds[current.catalog]
      if (!id) return { name,groups:[],cursor:{...current,done:true},warning:warning || (!catalogIds.length ? 'unsupported_category' : undefined) }
      const page = await cached([name,id,current.offset].join(':'), refresh,
        () => client.search({category:id,offset:current.offset,limit:pageSize}))
      const nextOffset = page.nextOffset ?? (typeof page.total === 'number'
        ? current.offset + page.items.length < page.total && page.items.length ? current.offset + page.items.length : null
        : page.items.length === pageSize ? current.offset + pageSize : null)
      const reachedLimit = nextOffset != null && nextOffset > 10000
      const queue = nextOffset != null && !reachedLimit ? [...pending,{catalog:current.catalog,offset:nextOffset}] : pending
      const next = queue.length ? {...queue[0],pending:queue.slice(1)} : {catalog:current.catalog,offset:current.offset,done:true}
      next.catalogs=catalogIds
      if (warning || reachedLimit || current.partial || categoryLimit) next.partial = true
      const groups = page.items.flatMap(item => {
        const group = studioGroup(name,item)
        if (!group) return []
        group.variants = group.variants.filter(variant => studioCountryAllowed(variant,country))
        return studioCapabilities[name].groupFromVariants && !group.variants.length ? [] : [group]
      })
      return { name, groups:mergeStudioGroups([],groups), cursor:next, warning:reachedLimit || categoryLimit ? 'catalog_scan_limit' : warning }
    } catch (error) {
      return { name,groups:[],cursor:current,error:error.code || 'provider_unreachable' }
    }
  }))
  return {
    groups:responses.flatMap(result=>result.groups),
    cursor:{ ...cursor,...Object.fromEntries(responses.map(result=>[result.name,result.cursor])) },
    issues:responses.flatMap(result=>result.error || result.warning
      ? [{provider:result.name,code:result.error || result.warning}] : []),
    hasMore:responses.some(result=>!result.cursor.done && !result.error),
    partial:responses.some(result=>!result.cursor.done || result.error || result.cursor.partial),
  }
}

export function studioProductVariants(product, offset) {
  if(!product.variants.length && product.total>offset)throw Object.assign(new Error('invalid_provider_response'),{code:'invalid_provider_response'})
  const unresolved=[]
  const configurations = product.variants.flatMap(variant => {
    if(Object.keys(variant.options || {}).length && !variant.combinations?.length){
      unresolved.push(variant.externalVariantId)
      return [] // Attribute lists alone do not prove a manufacturable Cartesian product.
    }
    const variants = Array.isArray(variant.combinations) && variant.combinations.length
      ? variant.combinations.map(row => row.attributes).filter(row=>row && typeof row === 'object' && !Array.isArray(row)) : [{}]
    return variants.map(configuration=>({
      ...variant,externalId:product.externalId, offset, configuration,
      countries:variant.countries || [],
      attributes:describeStudioVariant({ ...variant,attributes:{ ...variant.attributes,...configuration } }),
    }))
  })
  return { variants:configurations, unresolvedOptions:unresolved, nextOffset:(product.total == null ? product.variants.length === pageSize : product.total > offset+product.variants.length)
    ? offset+product.variants.length : null }
}

/** A Gelato configuration is an exact product UID, not a Cartesian product.
 * Progressively scan the same bounded/cached catalogue pages as discovery,
 * prioritizing the selected catalogue without claiming it is the only source.
 */
export async function studioGroupConfigurations(adapter, {provider,externalId,category,cursor,country,refresh=false}) {
  const client=adapter(provider)
  const [product,categories]=await Promise.all([
    cached(provider+':product:'+externalId,refresh,()=>client.product(externalId)),
    studioCapabilities[provider].groupFromVariants ? cached(provider+':categories',refresh,()=>client.categories()) : null,
  ])
  if(product.externalId!==externalId)throw Object.assign(new Error('provider_variant_mismatch'),{code:'provider_variant_mismatch'})
  const target=studioGroup(provider,product)
  if(!target)throw Object.assign(new Error('wall_art_selection_invalid'),{code:'wall_art_selection_invalid'})
  if(!studioCapabilities[provider].groupFromVariants){
    const page=studioProductVariants(product,cursor?.offset || 0)
    return {...page,variants:page.variants.filter(row=>studioCountryAllowed(row,country)),
      state:page.nextOffset==null && !page.unresolvedOptions.length?'complete':'partial'}
  }
  let position=cursor
  // The preferred catalogue is only an ordering hint checked against the
  // supplier's actual category list; it never becomes a new grouping identity.
  if(!position && category){
    const eligible=[...new Set(categories.filter(row=>/\bwall[- ]art\b/i.test(row.id)||wallArtGroup({externalId:row.id,title:row.title})).map(row=>row.id))]
    const index=eligible.indexOf(category)
    if(index>=0 && index<24)position={catalogs:eligible.slice(0,24),catalog:index,offset:0,pending:eligible.slice(0,24).flatMap((_,catalog)=>catalog===index?[]:[{catalog,offset:0}])}
  }
  const seed=target.variants.filter(row=>studioCountryAllowed(row,country))
  // One supplier page per read keeps this endpoint within the existing timeout.
  const batch=await discoverStudioProducts(adapter,{provider,country,cursor:position?{[provider]:position}:{},refresh})
  const found=batch.groups.filter(group=>group.id===target.id)
  const variants=mergeStudioGroups([{...target,variants:seed}],found)[0].variants
  position=batch.cursor[provider]
  const failed=batch.issues.some(issue=>issue.code!=='catalog_scan_limit')
  return {variants,cursor:position,hasMore:!position.done,state:failed?'failed':position.done&&!position.partial?'complete':'partial',
    issues:batch.issues}
}
