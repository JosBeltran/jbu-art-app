import { studioCapabilities, studioCountryAllowed, studioGroup, mergeStudioGroups, describeStudioVariant } from './studioDiscovery.js'
import { wallArtGroup } from './wallArt.js'

const lifetime = 5 * 60_000
const pageSize = 25
const cache = new Map()

async function cached(key, refresh, load) {
  const previous = cache.get(key)
  if (!refresh && previous?.until > Date.now()) return previous.value
  const value = await load()
  cache.delete(key)
  cache.set(key,{ value,until:Date.now()+lifetime })
  if (cache.size > 160) cache.delete(cache.keys().next().value)
  return value
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
      catalogIds = [...new Set(catalogIds)].slice(0,24)
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
  const configurations = product.variants.flatMap(variant => {
    const variants = Array.isArray(variant.combinations) && variant.combinations.length
      ? variant.combinations.map(row => row.attributes).filter(row=>row && typeof row === 'object' && !Array.isArray(row)) : [{}]
    return variants.map(configuration=>({
      ...variant,externalId:product.externalId, offset, configuration,
      countries:variant.countries || [],
      attributes:describeStudioVariant({ ...variant,attributes:{ ...variant.attributes,...configuration } }),
    }))
  })
  return { variants:configurations, nextOffset:(product.total == null ? product.variants.length === pageSize : product.total > offset+product.variants.length)
    ? offset+product.variants.length : null }
}
