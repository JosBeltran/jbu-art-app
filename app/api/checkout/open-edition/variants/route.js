import { serviceClient } from '@/lib/offersAuth'
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
      .select('id,artwork_id,price,size,finish,edition_type,is_active').in('id', ids)
      .eq('is_active', true).eq('edition_type', 'OPEN')
    if (error) throw error
    const artIds = [...new Set((variants || []).map(v => v.artwork_id))]
    const { data: arts, error: artError } = artIds.length
      ? await db.from('artworks').select('id,sku,title,primary_image_url,status').in('id', artIds).in('status', ['AVAILABLE', 'OWNED'])
      : { data: [], error: null }
    if (artError) throw artError
    const byArt = new Map(arts.map(a => [a.id, a]))
    return Response.json({ variants: (variants || []).filter(v => byArt.has(v.artwork_id))
      .map(v => ({ ...v, artwork: byArt.get(v.artwork_id) })) }, { headers: noStore })
  } catch (error) {
    console.error('[open-prints] public variant lookup failed', { code: error.code })
    return Response.json({ error: 'unavailable' }, { status: 503, headers: noStore })
  }
}
