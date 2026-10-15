import { serviceClient, getRequestUser, isAdminUser } from '@/lib/offersAuth'

const MANUAL_TYPES = ['MATERIAL_UPDATE', 'RESTORATION', 'FRAMING_UPDATE', 'EXHIBITION', 'PUBLICATION', 'MANUAL_PROVENANCE', 'OWNERSHIP_TRANSFERRED', 'ARCHIVED', 'WITHDRAWN']
const VISIBILITY = ['PUBLIC', 'PRIVATE', 'ADMIN_ONLY']
const COLS = 'id, artwork_id, event_type, event_date, date_precision, title, description, source, visibility, metadata, created_at, show_sale_price_publicly'

async function guard(request) {
  const db = serviceClient()
  const user = await getRequestUser(request, db)
  if (!user) return { error: Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 }) }
  if (!(await isAdminUser(user, db))) return { error: Response.json({ error: 'FORBIDDEN' }, { status: 403 }) }
  return { db, user }
}

const clean = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : null) || null

export async function GET(request, { params }) {
  const { id } = await params
  const g = await guard(request); if (g.error) return g.error
  const { data, error } = await g.db.from('provenance_events').select(COLS).eq('artwork_id', id).order('created_at', { ascending: true })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ events: data || [] })
}

export async function POST(request, { params }) {
  const { id } = await params
  const g = await guard(request); if (g.error) return g.error
  const b = await request.json().catch(() => ({}))
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
  return Response.json({ event: data })
}

export async function PATCH(request, { params }) {
  const { id } = await params
  const g = await guard(request); if (g.error) return g.error
  const b = await request.json().catch(() => ({}))
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
  const eventId = url.searchParams.get('event')
  const { data: current } = await g.db.from('provenance_events').select('id, source').eq('id', eventId).eq('artwork_id', id).maybeSingle()
  if (!current) return Response.json({ error: 'NOT_FOUND' }, { status: 404 })
  if (current.source !== 'MANUAL' && url.searchParams.get('confirmSystem') !== '1') return Response.json({ error: 'CONFIRM_SYSTEM' }, { status: 409 })
  const { error } = await g.db.from('provenance_events').delete().eq('id', eventId)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
