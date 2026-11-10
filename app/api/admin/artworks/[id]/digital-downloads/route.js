import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requirePreviewAdmin } from '@/lib/collection/admin.server'
import { HttpError, serviceClient } from '@/lib/certificates/adminAuth.server'
import { bucket, fitsPrint, imageTypes, inspectMaster, maxBytes, uuid, variantFields } from '@/lib/digitalDownloads/validation'
import { digitalAdminEnabled, json } from '@/lib/digitalDownloads/commerce'

const safeFields = 'id,revision,size,width_mm,height_mm,dpi,print_notes,currency,amount_minor,download_limit,active,master_name,pixel_width,pixel_height'
const target = z.object({ id: uuid, revision: uuid })
const command = z.discriminatedUnion('action', [
  variantFields.extend({ action: z.literal('create') }),
  variantFields.extend({ action: z.literal('save'), ...target.shape }),
  target.extend({ action: z.literal('upload') }),
  target.extend({
    action: z.literal('confirm'),
    uploadId: uuid,
    name: z.string().trim().min(1).max(255),
  }),
])

async function adminAction(request, params, run) {
  if (!digitalAdminEnabled()) return json({ error: 'disabled' }, 404)
  try {
    await requirePreviewAdmin(request)
    const { id } = await params
    if (!uuid.safeParse(id).success) return json({ error: 'invalid_artwork' }, 400)
    return await run(serviceClient(), id)
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code }, error.status)
    console.error('[digital-admin] operation failed', { code: error?.code })
    return json({ error: 'operation_failed' }, 500)
  }
}

export function GET(request, { params }) {
  return adminAction(request, params, async (db, artworkId) => {
    const { data, error } = await db.from('digital_art_variants').select(safeFields)
      .eq('artwork_id', artworkId).order('size').order('id')
    if (error) throw error
    return json({ variants: data })
  })
}

export function POST(request, { params }) {
  return adminAction(request, params, async (db, artworkId) => {
    const parsed = command.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'invalid_fields' }, 400)
    const { action, id, revision, ...fields } = parsed.data
    if (action === 'create') {
      if (fields.active) return json({ error: 'master_required' }, 400)
      const { data, error } = await db.from('digital_art_variants')
        .insert({ ...fields, artwork_id: artworkId }).select(safeFields).single()
      if (error) throw error
      return json({ variant: data }, 201)
    }

    const row = db.from('digital_art_variants')
    const current = await row.select(safeFields).eq('id', id).eq('artwork_id', artworkId).maybeSingle()
    if (current.error) throw current.error
    if (!current.data || current.data.revision !== revision) return json({ error: 'stale_variant' }, 409)
    const update = async (values) => {
      const { data, error } = await db.from('digital_art_variants').update({ ...values, revision: randomUUID() })
        .eq('id', id).eq('artwork_id', artworkId).eq('revision', revision).select(safeFields).maybeSingle()
      if (error) throw error
      return data
    }
    if (action === 'save') {
      if (fields.active && !current.data.master_name) return json({ error: 'master_required' }, 400)
      if (fields.active && !fitsPrint(fields, current.data)) return json({ error: 'insufficient_resolution' }, 422)
      const variant = await update(fields)
      return variant ? json({ variant }) : json({ error: 'stale_variant' }, 409)
    }

    const files = db.storage.from(bucket)
    const stagingPrefix = `staging/${artworkId}/${id}/${revision}/`
    if (action === 'upload') {
      const uploadId = randomUUID()
      const path = stagingPrefix + uploadId
      const { data, error } = await files.createSignedUploadUrl(path, { upsert: false })
      if (error) throw error
      return json({ uploadId, path, token: data.token })
    }

    const stagedPath = stagingPrefix + fields.uploadId
    const staged = await files.download(stagedPath)
    if (staged.error || !staged.data) return json({ error: 'upload_missing' }, 422)
    let bytes
    let measured
    try {
      if (staged.data.size > maxBytes) throw new Error('invalid_master')
      bytes = Buffer.from(await staged.data.arrayBuffer())
      measured = await inspectMaster(bytes)
    } catch {
      await files.remove([stagedPath])
      return json({ error: 'invalid_master' }, 422)
    }
    if (current.data.active && !fitsPrint(current.data, measured)) {
      await files.remove([stagedPath])
      return json({ error: 'insufficient_resolution' }, 422)
    }
    // Copy the exact validated bytes to a fresh, service-only key. An upload
    // token can only affect its staging object, including if it is replayed.
    const extension = measured.format === 'jpeg' ? 'jpg' : 'png'
    const path = `masters/${artworkId}/${id}/${randomUUID()}.${extension}`
    const name = fields.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100)
    const stored = await files.upload(path, bytes, { contentType: imageTypes[measured.format], upsert: false })
    if (stored.error) throw stored.error
    const variant = await update({
      master_path: path, master_name: `${name || 'jbu-fine-art'}.${extension}`,
      pixel_width: measured.pixel_width, pixel_height: measured.pixel_height,
    })
    await files.remove(variant ? [stagedPath] : [stagedPath, path])
    return variant ? json({ variant }) : json({ error: 'stale_variant' }, 409)
  })
}
