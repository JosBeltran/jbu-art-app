import { removeLegacyArtworkVersionSuffix } from './artworkVersionTitle.js'

export const INVENTORY_PREFERENCE_KEY = 'jbu_artwork_inventory'
export const INVENTORY_PATH = '/admin/artworks'
export const PAGE_SIZES = [25, 50, 100]
export const FILTER_KEYS = ['series', 'status', 'availability', 'year', 'medium', 'version', 'edition', 'ownership', 'prints']
export const SORT_KEYS = ['title', 'sku', 'series', 'year', 'medium', 'status', 'availability', 'ownership', 'price', 'created_at', 'updated_at', 'owner', 'prints']
export const GROUP_KEYS = ['series', 'status', 'year', 'edition', 'medium']
export const AVAILABILITY_TARGETS = ['AVAILABLE', 'NOT_FOR_SALE']
export const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

export const defaultQuery = {
  search: '', filters: {}, sort: 'created_at', descending: true,
  page: 1, size: 25, group: '', view: 'all',
}

export const defaultColumnIds = ['thumbnail', 'title', 'availability', 'status', 'series', 'year', 'price']
export const defaultLayout = { columns: defaultColumnIds, density: 'comfortable' }

export function parseInventoryQuery(params) {
  const filters = {}
  for (const key of FILTER_KEYS) {
    const values = [...new Set(params.getAll(key).filter(value => value && value.length <= 200))].slice(0, 20)
    if (values.length) filters[key] = values
  }
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  const sort = params.get('sort')
  const group = params.get('group')
  return {
    search: (params.get('q') || '').slice(0, 200), filters,
    sort: SORT_KEYS.includes(sort) ? sort : defaultQuery.sort,
    descending: params.get('dir') !== 'asc',
    page: Number.isInteger(page) && page >= 1 && page <= 1000000 ? page : 1,
    size: PAGE_SIZES.includes(size) ? size : 25,
    group: GROUP_KEYS.includes(group) ? group : '',
    view: (params.get('view') || 'all').slice(0, 80),
  }
}

export function inventoryParams(query, navigation = true) {
  const params = new URLSearchParams()
  if (query.search) params.set('q', query.search)
  for (const key of FILTER_KEYS) {
    for (const value of query.filters[key] || []) params.append(key, value)
  }
  params.set('sort', query.sort)
  params.set('dir', query.descending ? 'desc' : 'asc')
  params.set('page', String(query.page))
  params.set('size', String(query.size))
  if (navigation && query.group) params.set('group', query.group)
  if (navigation && query.view !== 'all') params.set('view', query.view)
  return params
}

export function normalizeInventorySearch(search) {
  return search.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

export function inventoryReturnPath(value) {
  if (typeof value !== 'string' || value.length > 10000) return INVENTORY_PATH
  if (!value.startsWith(INVENTORY_PATH + '?')) return INVENTORY_PATH
  const query = parseInventoryQuery(new URLSearchParams(value.slice(INVENTORY_PATH.length + 1)))
  return INVENTORY_PATH + '?' + inventoryParams(query).toString()
}

export function inventoryImageSource(value, storageOrigin) {
  if (typeof value !== 'string' || !value || value.includes('\\')) return null
  try {
    const url = new URL(value, 'https://inventory.invalid/')
    decodeURIComponent(url.pathname)
    if (url.search || url.hash || url.username || url.password || /%2f|%5c/i.test(url.pathname)) return null
    if (!/\.(?:avif|webp|jpe?g|png)$/i.test(url.pathname)) return null
    if (url.origin === 'https://inventory.invalid' && /^\/assets-optimized\/artworks\//.test(url.pathname)) return url.pathname
    if (url.protocol === 'https:' && storageOrigin && url.origin === new URL(storageOrigin).origin &&
      /^\/storage\/v1\/object\/public\/artworks\/artwork-images\//.test(url.pathname)) return url.href
  } catch {
    return null
  }
  return null
}

export function inventoryThumbnail(source, width) {
  return '/_next/image?' + new URLSearchParams({ url: source, w: String(width), q: '75' })
}

export function parseInventoryPreferences(value) {
  if (value?.version !== 1 || !Array.isArray(value.views)) return null
  function layout(input) {
    return {
      columns: Array.isArray(input?.columns) ? input.columns.filter(id => typeof id === 'string').slice(0, 25) : defaultLayout.columns,
      density: input?.density === 'compact' ? 'compact' : 'comfortable',
    }
  }
  return {
    layout: layout(value.layout),
    views: value.views.filter(view => typeof view?.id === 'string' && UUID_PATTERN.test(view.id) && typeof view.name === 'string')
      .slice(0, 20).map(view => {
        const params = new URLSearchParams()
        for (const key of FILTER_KEYS) {
          if (Array.isArray(view.filters?.[key])) {
            for (const filter of view.filters[key]) {
              if (typeof filter === 'string') params.append(key, filter)
            }
          }
        }
        if (typeof view.search === 'string') params.set('q', view.search)
        params.set('sort', view.settings?.sort || '')
        params.set('dir', view.settings?.descending === false ? 'asc' : 'desc')
        params.set('group', view.settings?.group || '')
        params.set('size', view.settings?.size || '')
        const { search, filters, sort, descending, group, size } = parseInventoryQuery(params)
        return {
          id: view.id, name: view.name.slice(0, 80), search, filters, layout: layout(view.layout),
          settings: { sort, descending, group, size },
        }
      }),
  }
}

export function inventoryArtworkTitle(title, version) {
  if (!title || version !== 'historical') return title
  return removeLegacyArtworkVersionSuffix(title)
}
