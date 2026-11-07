import { serviceClient } from '@/lib/offersAuth'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import { variantImage } from '@/lib/printImages'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'no-store' }

// Public product catalogue response, restricted to active Open Edition variants.
// Does not expose privileged artwork, owner, or customer fields.
export async function GET(request) {
  try {
    const ids = [...new Set((new URL(request.url).searchParams.get('ids') || '').split(',').filter(Boolean))]
    if (!ids.length || ids.length > 25 || ids.some(id => !/^[0-9a-f-]{36}$/i.test(id)))
      return Response.json({ error: 'invalid_ids' }, { status: 400, headers: noStore })
    const db = serviceClient()
    const { data: variants, error } = await db.from('artwork_prints')
      .select('*').in('id', ids)
      .eq('is_active', true).or('is_available.is.null,is_available.eq.true').eq('edition_type', 'OPEN')
    if (error) throw error
    const artIds = [...new Set((variants || []).map(v => v.artwork_id))]
    const { data: arts, error: artError } = artIds.length
      ? await db.from('artworks_discoverable').select('id,sku,title,primary_image_url,status').in('id', artIds).in('status', ['AVAILABLE', 'OWNED'])
      : { data: [], error: null }
    if (artError) throw artError
    const byArt = new Map(arts.map(a => [a.id, a]))
    const imageMap = await getPrintMediaMap(db, arts, variants || [])
    return Response.json({ variants: (variants || []).filter(v => byArt.has(v.artwork_id))
      .map(v => ({ ...v, resolved_print_image_url: variantImage(imageMap[v.artwork_id]?.variants?.find(row => row.id === v.id), byArt.get(v.artwork_id).primary_image_url, imageMap[v.artwork_id]?.gallery), artwork: byArt.get(v.artwork_id) })) }, { headers: noStore })
  } catch (error) {
    console.error('[open-prints] public variant lookup failed', { code: error.code })
    return Response.json({ error: 'unavailable' }, { status: 503, headers: noStore })
  }
}
