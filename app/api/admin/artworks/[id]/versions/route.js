import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const FIELDS = 'id,title,sku,primary_image_url,status,version_parent_id,version_kind,is_historical_version,version_published_at'

async function handle(request, context, action) {
  try {
    await requireCertificateAdmin(request)
    const { id } = await context.params
    if (!UUID.test(id)) throw new HttpError(400, 'invalid_version')
    return Response.json(await action(serviceClient(), id), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.code }, { status: error.status })
    const conflicts = ['version_id_conflict', 'invalid_version_predecessor', 'version_predecessor_locked', 'version_parent_unpublished']
    if (error.code === '23505') return Response.json({ error: 'successor_exists' }, { status: 409 })
    if (conflicts.includes(error.message)) return Response.json({ error: error.message }, { status: 409 })
    if (['invalid_version', 'version_image_required', 'version_price_required', 'invalid_version_event'].includes(error.message))
      return Response.json({ error: error.message }, { status: 400 })
    if (error.message === 'artwork_not_found') return Response.json({ error: error.message }, { status: 404 })
    console.error('[artwork versions]', error.code || error.message)
    return Response.json({ error: 'versions_unavailable' }, { status: 503 })
  }
}

export function GET(request, context) {
  return handle(request, context, async (db, id) => {
    const { data: artwork, error } = await db.from('artworks').select(FIELDS).eq('id', id).maybeSingle()
    if (error) throw error
    if (!artwork) throw new HttpError(404, 'artwork_not_found')
    const [children, events, parent, stage] = await Promise.all([
      db.from('artworks').select(FIELDS).eq('version_parent_id', id).order('created_at'),
      db.from('provenance_events').select('id,title,event_date').eq('artwork_id', id).order('created_at', { ascending: false }),
      artwork.version_parent_id
        ? db.from('artworks').select('id,title').eq('id', artwork.version_parent_id).maybeSingle()
        : { data: null },
      artwork.version_parent_id
        ? db.from('provenance_events').select('metadata').eq('artwork_id', id).eq('dedupe_key', 'ARTWORK_VERSION:' + id).maybeSingle()
        : { data: null },
    ])
    for (const result of [children, events, parent, stage]) if (result.error) throw result.error
    let linkedEvent = null
    const eventId = stage.data?.metadata?.linked_event_id
    if (eventId && UUID.test(eventId)) {
      const { data, error } = await db.from('provenance_events').select('id,title').eq('id', eventId)
        .eq('artwork_id', artwork.version_parent_id).maybeSingle()
      if (error) throw error
      linkedEvent = data
    }
    return { artwork, children: children.data, events: events.data, parent: parent.data, linkedEvent }
  })
}

export function POST(request, context) {
  return handle(request, context, async (db, id) => {
    const body = await request.json().catch(() => null)
    if (!body || !UUID.test(body.versionId || '') || !['SNAPSHOT', 'SUCCESSOR'].includes(body.kind) ||
      typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200 ||
      (body.note && (typeof body.note !== 'string' || body.note.length > 2000)) ||
      (body.eventId && !UUID.test(body.eventId))) throw new HttpError(400, 'invalid_version')

    if (body.image) {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') + '/storage/v1/object/public/artworks/artwork-images/'
      if (typeof body.image !== 'string' || !body.image.startsWith(base) ||
        !/^versions\/[\w-]+\.(?:jpe?g|png|webp)$/i.test(body.image.slice(base.length)))
        throw new HttpError(400, 'invalid_version_image')
    }
    if (body.kind === 'SUCCESSOR' && !body.image) throw new HttpError(400, 'version_image_required')
    const { data, error } = await db.rpc('create_artwork_version', {
      _parent: id, _id: body.versionId, _kind: body.kind, _title: body.title.trim(), _image: body.image || null,
      _note: body.note || null, _event: body.eventId || null,
    })
    if (error) throw error
    return { version: data }
  })
}

export function PATCH(request, context) {
  return handle(request, context, async (db, id) => {
    const body = await request.json().catch(() => null)
    if (typeof body?.forSale !== 'boolean') throw new HttpError(400, 'invalid_version')
    const { data, error } = await db.rpc('publish_artwork_version', { _id: id, _for_sale: body.forSale })
    if (error) throw error
    return { version: data }
  })
}
