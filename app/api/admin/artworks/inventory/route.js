import { HttpError, requireCertificateAdmin, serviceClient } from '@/lib/certificates/adminAuth.server'
import { AVAILABILITY_TARGETS, INVENTORY_PREFERENCE_KEY, inventoryImageSource, normalizeInventorySearch, parseInventoryPreferences, parseInventoryQuery, UUID_PATTERN } from '@/lib/adminArtworkInventory'

import { imageVariants } from '@/lib/mediaVariants'

const noStore = { 'Cache-Control': 'private, no-store' }

function json(data, status = 200) {
  return Response.json(data, { status, headers: noStore })
}

function failure(error) {
  if (error instanceof HttpError) return json({ error: error.code }, error.status)
  console.error('[artwork inventory]', { code: error?.code })
  if (error?.code === '55P03') return json({ error: 'inventory_busy' }, 409)
  return json({ error: 'inventory_unavailable' }, 503)
}

export async function GET(request) {
  try {
    const { user } = await requireCertificateAdmin(request)
    const params = new URL(request.url).searchParams
    const query = parseInventoryQuery(params)
    const { data, error } = await serviceClient().rpc('admin_artwork_inventory', {
      _search: normalizeInventorySearch(query.search), _filters: query.filters, _sort: query.sort,
      _descending: query.descending, _page: query.page, _size: query.size,
      _include_facets: params.get('facets') === '1',
    }).abortSignal(request.signal)
    if (error) throw error
    const rows = data.rows.map(({ primary_image_url, ...row }) => {
      const source = inventoryImageSource(primary_image_url, process.env.NEXT_PUBLIC_SUPABASE_URL)
      const variant = source?.startsWith('https:') ? imageVariants(source)?.thumbnail : null
      return { ...row, thumbnails: [variant, source].filter(Boolean) }
    })
    return json({
      ...data, rows, administrator: user.id,
      preferences: params.get('facets') === '1' ? parseInventoryPreferences(user.user_metadata?.[INVENTORY_PREFERENCE_KEY]) : undefined,
    })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request) {
  try {
    await requireCertificateAdmin(request)
    const body = await request.json().catch(() => null)
    if (!Array.isArray(body?.ids) || !body.ids.length || body.ids.length > 100 ||
      body.ids.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id)) ||
      !AVAILABILITY_TARGETS.includes(body.target) || typeof body.apply !== 'boolean') {
      throw new HttpError(400, 'invalid_inventory_transition')
    }
    const { data, error } = await serviceClient().rpc('admin_change_artwork_inventory_availability', {
      _ids: [...new Set(body.ids)], _target: body.target, _apply: body.apply,
    })
    if (error) throw error
    return json({ results: data })
  } catch (error) {
    return failure(error)
  }
}
