import { serviceClient, getRequestUser, isAdminUser } from '@/lib/offersAuth'

const MANUAL_TYPES = ['MATERIAL_UPDATE', 'RESTORATION', 'FRAMING_UPDATE', 'EXHIBITION', 'PUBLICATION', 'MANUAL_PROVENANCE', 'OWNERSHIP_TRANSFERRED', 'ARCHIVED', 'WITHDRAWN']
const VISIBILITY = ['PUBLIC', 'PRIVATE', 'ADMIN_ONLY']
const COLS = 'id, artwork_id, event_type, event_date, date_precision, title, description, source, visibility, metadata, created_at, show_sale_price_publicly, primary_image_url'
const IMAGE_COLS = 'id, provenance_event_id, artwork_id, image_url, caption_es, caption_en, stage_label, display_order, created_at'

async function guard(request) {
  const db = serviceClient()
  const user = await getRequestUser(request, db)
  if (!user) return { error: Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 }) }
  if (!(await isAdminUser(user, db))) return { error: Response.json({ error: 'FORBIDDEN' }, { status: 403 }) }
  return { db, user }
}

const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : null) || null

async function eventBelongsToArtwork(db, eventId, artworkId) {
  if (!eventId) return null
  const { data } = await db.from('provenance_events').select('id, artwork_id, source, primary_image_url')
    .eq('id', eventId).eq('artwork_id', artworkId).maybeSingle()
  return data || null
}

async function attachImages(db, artworkId, events) {
  if (!events?.length) return events || []
  const { data: images, error } = await db.from('provenance_event_images')
    .select(IMAGE_COLS)
    .eq('artwork_id', artworkId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return events.map((event) => ({ ...event, images: [] }))
  const byEvent = new Map()
  for (const image of images || []) {
    if (!byEvent.has(image.provenance_event_id)) byEvent.set(image.provenance_event_id, [])
    byEvent.get(image.provenance_event_id).push(image)
  }
  return events.map((event) => ({ ...event, images: byEvent.get(event.id) || [] }))
}

export async function GET(request, { params }) {
  const { id } = await params
  const g = await guard(request); if (g.error) return g.error
  const { data, error } = await g.db.from('provenance_events').select(COLS).eq('artwork_id', id).order('created_at', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ events: await attachImages(g.db, id, data || []) })
}

export async function POST(request, { params }) {
  const { id } = await params
  const g = await guard(request); if (g.error) return g.error
  const b = await request.json().catch(() => ({}))

  if (b.action === 'ADD_IMAGE') {
    const current = await eventBelongsToArtwork(g.db, b.eventId, id)
    if (!current) return Response.json({ error: 'EVENT_NOT_FOUND' }, { status: 404 })
    const imageUrl = clean(b.image_url, 4000)
    if (!imageUrl) return Response.json({ error: 'IMAGE_REQUIRED' }, { status: 400 })
    const { count } = await g.db.from('provenance_event_images')
      .select('id', { count: 'exact', head: true }).eq('provenance_event_id', current.id)
    const row = {
      provenance_event_id: current.id,
      artwork_id: id,
      image_url: imageUrl,
      caption_es: clean(b.caption_es, 500),
      caption_en: clean(b.caption_en, 500),
      stage_label: clean(b.stage_label, 80),
      display_order: Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : (count || 0)
    }
    const { data, error } = await g.db.from('provenance_event_images').insert(row).select(IMAGE_COLS).single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!current.primary_image_url) {
      await g.db.from('provenance_events').update({ primary_image_url: imageUrl }).eq('id', current.id)
    }
    return Response.json({ image: data })
  }

  if (!MANUAL_TYPES.includes(b.event_type)) return Response.json({ error: 'INVALID_TYPE' }, { status: 400 })
  const title = clean(b.title, 200)
  if (!title) return Response.json({ error: 'TITLE_REQUIRED' }, { status: 400 })
  const defaultVis = ['ARCHIVED', 'WITHDRAWN'].includes(b.event_type) ? 'ADMIN_ONLY' : 'PUBLIC'
  const row = {
    artwork_id: id, event_type: b.event_type, title, description: clean(b.description),
    event_date: clean(b.event_date, 10), date_precision: b.event_date ? (b.event_date.length === 4 ? 'YEAR' : b.event_date.length === 7 ? 'MONTH' : 'DAY') : null,
    visibility: VISIBILITY.includes(b.visibility) ? b.visibility : defaultVis,
    metadata: b.metadata && typeof b.metadata === 'object' ? b.metadata : {},
    source: 'MANUAL', created_by: g.user.id
  }
  const { data, error } = await g.db.from('provenance_events').insert(row).select(COLS).single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ event: { ...data, images: [] } })
}

export async function PATCH(request, { params }) {
  const { id } = await params
  const g = await guard(request); if (g.error) return g.error
  const b = await request.json().catch(() => ({}))

  if (b.action === 'UPDATE_IMAGE') {
    const { data: current } = await g.db.from('provenance_event_images').select(IMAGE_COLS)
      .eq('id', b.imageId).eq('artwork_id', id).maybeSingle()
    if (!current) return Response.json({ error: 'IMAGE_NOT_FOUND' }, { status: 404 })
    const patch = {}
    if ('caption_es' in b) patch.caption_es = clean(b.caption_es, 500)
    if ('caption_en' in b) patch.caption_en = clean(b.caption_en, 500)
    if ('stage_label' in b) patch.stage_label = clean(b.stage_label, 80)
    if ('display_order' in b && Number.isFinite(Number(b.display_order))) patch.display_order = Number(b.display_order)
    const { data, error } = await g.db.from('provenance_event_images').update(patch).eq('id', b.imageId).select(IMAGE_COLS).single()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ image: data })
  }

  const { data: current } = await g.db.from('provenance_events').select('id, source').eq('id', b.id).eq('artwork_id', id).maybeSingle()
  if (!current) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
  const patch = {}
  if (b.visibility && VISIBILITY.includes(b.visibility)) patch.visibility = b.visibility
  const textEdit = 'title' in b || 'description' in b || 'event_date' in b
  if (textEdit && current.source !== 'MANUAL' && !b.confirmSystem) return Response.json({ error: 'CONFIRM_SYSTEM' }, { status: 409 })
  if ('title' in b) { const t = clean(b.title, 200); if (!t) return Response.json({ error: 'TITLE_REQUIRED' }, { status: 400 }); patch.title = t }
  if ('description' in b) patch.description = clean(b.description)
  if ('event_date' in b && current.source === 'MANUAL') patch.event_date = clean(b.event_date, 10)
  if ('show_sale_price_publicly' in b) patch.show_sale_price_publicly = Boolean(b.show_sale_price_publicly)
  const { data, error } = await g.db.from('provenance_events').update(patch).eq('id', b.id).select(COLS).single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ event: data })
}

export async function DELETE(request, { params }) {
  const { id } = await params
  const g = await guard(request); if (g.error) return g.error
  const url = new URL(request.url)
  const imageId = url.searchParams.get('image')
  if (imageId) {
    const { data: image } = await g.db.from('provenance_event_images').select(IMAGE_COLS)
      .eq('id', imageId).eq('artwork_id', id).maybeSingle()
    if (!image) return Response.json({ error: 'IMAGE_NOT_FOUND' }, { status: 404 })
    const { error } = await g.db.from('provenance_event_images').delete().eq('id', imageId)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const { data: first } = await g.db.from('provenance_event_images').select('image_url')
      .eq('provenance_event_id', image.provenance_event_id)
      .order('display_order', { ascending: true }).order('created_at', { ascending: true }).limit(1).maybeSingle()
    await g.db.from('provenance_events').update({ primary_image_url: first?.image_url || null }).eq('id', image.provenance_event_id)
    return Response.json({ ok: true })
  }

  const eventId = url.searchParams.get('event')
  const { data: current } = await g.db.from('provenance_events').select('id, source').eq('id', eventId).eq('artwork_id', id).maybeSingle()
  if (!current) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
  if (current.source !== 'MANUAL' && url.searchParams.get('confirmSystem') !== '1') return Response.json({ error: 'CONFIRM_SYSTEM' }, { status: 409 })
  const { error } = await g.db.from('provenance_events').delete().eq('id', eventId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
