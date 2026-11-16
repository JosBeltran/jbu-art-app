import { randomUUID } from 'node:crypto'
import { HttpError, requireCertificateAdmin, requireUser, serviceClient } from '@/lib/certificates/adminAuth.server'
import { GALLERY_BUCKET, MAX_GALLERY_UPLOAD, PHOTO_TYPES, mediaPath, prepareGalleryPhoto, saveGalleryPhoto } from './collectorGalleryMedia.mjs'

const TABLE = 'collector_gallery_entries'
const PUBLIC_FIELDS = 'id,caption_es,caption_en,category,featured,width,height'
const COLLECTOR_FIELDS = 'id,status,caption_es,caption_en,created_at'
const PRIVATE = { 'Cache-Control': 'private, no-store' }
const validId = value => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const bad = (code = 'invalid_request') => { throw new HttpError(400, code) }
const checked = ({ data, error }) => { if (error) throw error; return data }
const dbEntries = db => db.from(TABLE)
const bucket = db => db.storage.from(GALLERY_BUCKET)
const publicOnly = query => query.eq('status', 'APPROVED').eq('visible', true).is('withdrawn_at', null)
const reply = value => Response.json(value, { headers: PRIVATE })

async function formBody(request) {
  const max = MAX_GALLERY_UPLOAD + 32768
  if (Number(request.headers.get('content-length')) > max || !request.body) throw new HttpError(413, 'photo_too_large')
  const reader = request.body.getReader()
  const chunks = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      await reader.cancel()
      throw new HttpError(413, 'photo_too_large')
    }
    chunks.push(value)
  }
  return new Response(Buffer.concat(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } })
    .formData().catch(() => bad())
}

function fields(get, admin) {
  const entry = {}
  for (const field of ['caption_es', 'caption_en']) {
    const value = get(field)
    if (value == null) continue
    if (typeof value !== 'string' || value.length > 300) bad()
    entry[field] = value.trim()
  }
  const artwork = get('artwork_id')
  if (artwork != null) {
    if (artwork !== '' && !validId(artwork)) bad()
    entry.artwork_id = artwork || null
  }
  if (!admin) return entry
  const category = get('category')
  const order = get('display_order')
  const featured = get('featured')
  if (category != null) {
    if (!['private', 'studio', 'public'].includes(category)) bad()
    entry.category = category
  }
  if (order != null) {
    if (!/^-?\d{1,6}$/.test(String(order))) bad()
    entry.display_order = Number(order)
  }
  if (featured != null) {
    if (typeof featured !== 'boolean') bad()
    entry.featured = featured
  }
  return entry
}

const owned = async (db, user) => checked(await db.rpc('collector_gallery_owned_artworks', { p_user: user.id }))

async function image(db, query, id, variant) {
  if (!validId(id) || !['full', 'thumb'].includes(variant)) bad()
  const entry = checked(await query.eq('id', id).maybeSingle())
  if (!entry) throw new HttpError(404, 'photo_unavailable')
  const { data, error } = await bucket(db).download(mediaPath(id, variant))
  if (error) return new Response(null, { status: 404, headers: PRIVATE })
  return new Response(data, { headers: { ...PRIVATE, 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' } })
}

async function upload(request, db, user, admin) {
  if (!admin) {
    const allowed = checked(await db.rpc('consume_collector_gallery_upload', { p_user: user.id }))
    if (!allowed) throw new HttpError(429, 'upload_limit')
  }
  const form = await formBody(request)
  const entry = fields(key => form.get(key), admin)
  if (!admin && form.get('consent') !== 'on') bad('consent_required')
  if (!admin && entry.artwork_id && !(await owned(db, user)).some(item => item.id === entry.artwork_id)) {
    throw new HttpError(403, 'ownership_unverified')
  }
  const file = form.get('photo')
  if (!(file instanceof Blob) || !Object.values(PHOTO_TYPES).includes(file.type)) bad('invalid_photo')
  if (file.size > MAX_GALLERY_UPLOAD) throw new HttpError(413, 'photo_too_large')
  const bytes = Buffer.from(await file.arrayBuffer())
  const photo = await prepareGalleryPhoto(bytes, file.type).catch(() => bad('invalid_photo'))
  const id = randomUUID()
  try {
    await saveGalleryPhoto(bucket(db), id, photo)
    checked(await dbEntries(db).insert({
      ...entry, id, width: photo.width, height: photo.height, actor_id: user.id,
      source: admin ? 'HISTORICAL' : 'COLLECTOR', status: admin ? 'DRAFT' : 'PENDING',
      ...(admin ? {} : { submitter_id: user.id, consent_at: new Date().toISOString(), consent_version: 'gallery-v1' }),
    }))
  } catch (error) {
    // Check whether the insert committed before compensating for a failed response.
    const state = await dbEntries(db).select('id').eq('id', id).maybeSingle()
    if (!state.error && !state.data) await bucket(db).remove(['full', 'thumb'].map(variant => mediaPath(id, variant)))
    throw error
  }
  return reply({ id })
}

const changes = {
  approve: { status: 'APPROVED', visible: false },
  reject: { status: 'REJECTED', visible: false },
  hide: { status: 'HIDDEN', visible: false },
  publish: { visible: true },
  unpublish: { visible: false },
  remove: { status: 'REMOVED', visible: false },
}

async function update(request, db, user, admin) {
  const body = await request.json().catch(() => bad())
  if (!body || !validId(body.id)) bad()
  const now = new Date().toISOString()
  const metadata = { actor_id: user.id, updated_at: now }
  let query = dbEntries(db)
  if (!admin) {
    query = query.update({ ...metadata, status: 'WITHDRAWN', visible: false, withdrawn_at: now })
      .eq('submitter_id', user.id).is('withdrawn_at', null).neq('status', 'REMOVED')
  } else {
    const { action } = body
    let patch = {}
    if (action === 'edit') patch = fields(key => body[key], true)
    else if (Object.hasOwn(changes, action)) patch = changes[action]
    else bad()
    if (action === 'approve') {
      if (body.rights_confirmed !== true) bad('rights_confirmation_required')
      patch = { ...patch, approved_at: now, approved_by: user.id }
    }
    query = query.update({ ...patch, ...metadata })
    if (action !== 'remove') query = query.is('withdrawn_at', null).neq('status', 'REMOVED')
    if (action === 'publish') query = query.eq('status', 'APPROVED')
  }
  const row = checked(await query.eq('id', body.id).select('id,source,status').maybeSingle())
  if (!row) throw new HttpError(409, 'entry_unavailable')
  if (row.status === 'REMOVED') {
    const variants = row.source === 'LEGACY' ? ['original', 'full', 'thumb'] : ['full', 'thumb']
    checked(await bucket(db).remove(variants.map(variant => mediaPath(row.id, variant))))
  }
  return reply({ ok: true })
}

export function galleryHandler(scope) {
  return async request => {
    try {
      const url = new URL(request.url)
      const id = url.searchParams.get('id')
      const variant = url.searchParams.get('variant') || 'full'
      if (scope === 'public') {
        const db = serviceClient()
        if (id !== null) return await image(db, publicOnly(dbEntries(db).select('id')), id, variant)
        return reply(checked(await publicOnly(dbEntries(db).select(PUBLIC_FIELDS))
          .order('featured', { ascending: false }).order('display_order').order('created_at').order('id').limit(48)))
      }
      const admin = scope === 'admin'
      const { user } = await (admin ? requireCertificateAdmin(request) : requireUser(request))
      const db = serviceClient()
      if (request.method === 'POST') return await upload(request, db, user, admin)
      if (request.method === 'PATCH') return await update(request, db, user, admin)
      if (id !== null && admin) return await image(db, dbEntries(db).select('id').neq('status', 'REMOVED'), id, variant)
      const rows = dbEntries(db).select(admin ? '*' : COLLECTOR_FIELDS).order('created_at', { ascending: false }).order('id')
      const page = Number(url.searchParams.get('page') || 0)
      if (!Number.isSafeInteger(page) || page < 0 || page > 10000) bad()
      rows.range(page * 24, page * 24 + 23)
      if (admin) return reply(checked(await rows))
      return reply({ entries: checked(await rows.eq('submitter_id', user.id)), artworks: await owned(db, user) })
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('[collector-gallery]', error?.code || error?.name)
      return Response.json({ error: error instanceof HttpError ? error.code : 'gallery_unavailable' }, {
        status: error instanceof HttpError ? error.status : 500, headers: PRIVATE,
      })
    }
  }
}
