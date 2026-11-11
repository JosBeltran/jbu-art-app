import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { deferredPrintMaster, publicProduction, regenerateApprovedPrintPreview } from '@/lib/deferredPrintMaster.server'
import { PrintAssetError } from '@/lib/printAssetLayout'
import { isPrintId } from '@/lib/printManager'
import { PRINT_MASTER_BUCKET } from '@/lib/printAssetPresets'

export const runtime = 'nodejs'
export const maxDuration = 120
const noStore = { 'Cache-Control': 'no-store' }

async function admin(request, action) {
  try {
    const { user } = await requireCertificateAdmin(request)
    return Response.json(await action(serviceClient(), user.id), { headers: noStore })
  } catch (error) {
    if (error instanceof PrintAssetError || error instanceof HttpError)
      return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    console.error('[print production]', error?.code || error?.name)
    return Response.json({ error: 'production_unavailable' }, { status: 503, headers: noStore })
  }
}

async function selection(db, { item, variant }) {
  if (Boolean(item) === Boolean(variant) || !isPrintId(item || variant))
    throw new HttpError(400, 'invalid_options')
  let preparation
  if (item) {
    const { data, error } = await db.from('print_order_preparations')
      .select('item_id,order_id,revision_id,snapshot,state,orders!inner(payment_status,status)')
      .eq('item_id', item).maybeSingle()
    if (error) throw error
    if (!data) throw new HttpError(404, 'preparation_not_found')
    if (data.orders?.payment_status !== 'PAID' || data.orders?.status === 'CANCELLED')
      throw new HttpError(409, 'order_not_eligible')
    preparation = data
    if (!data.revision_id) return { preparation, row: null }
  }
  let query = db.from('print_asset_generations').select('*')
  query = item ? query.eq('revision_id', preparation.revision_id) : query.eq('print_id', variant).eq('is_current', true)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) throw new HttpError(404, 'layout_unavailable')
  return { preparation, row: data }
}

export function GET(request) {
  return admin(request, async db => {
    const params = new URL(request.url).searchParams
    const item = params.get('item')
    const variant = params.get('variant')
    if (!item && !variant) {
      const order = params.get('order')
      const page = Number(params.get('page') || 1)
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new HttpError(400, 'invalid_options')
      const pageSize = 30
      const offset = (page - 1) * pageSize
      if (order !== null && !isPrintId(order)) throw new HttpError(400, 'invalid_options')
      let query = db.from('print_order_preparations')
        .select('item_id,order_id,state,snapshot,orders!inner(status,payment_status)', { count: 'exact' })
        .eq('orders.payment_status', 'PAID').neq('orders.status', 'CANCELLED')
      query = order ? query.eq('order_id', order) : query.neq('state', 'READY')
      const { data, error, count } = await query.order('created_at').order('item_id').range(offset, offset + pageSize - 1)
      if (error) throw error
      return { queue: data || [], count, pageSize }
    }

    const { preparation, row } = await selection(db, { item, variant })
    if (params.has('download') || params.has('review')) {
      if (!row?.production_file_path) throw new HttpError(404, 'master_not_found')
      if (params.has('download') && preparation && preparation.state !== 'READY')
        throw new HttpError(409, 'approval_required')
      const options = params.has('download') ? { download: 'JBU-' + row.size + '-' + (row.layout?.outputDpi ?? 300) + 'dpi.jpg' } : undefined
      const { data, error } = await db.storage.from(PRINT_MASTER_BUCKET).createSignedUrl(row.production_file_path, 300, options)
      if (error || !data?.signedUrl) throw new HttpError(503, 'storage_failed')
      return { url: data.signedUrl }
    }
    if (!row) return { preparation, production: null }
    const [art, gallery, provenance] = await Promise.all([
      db.from('artworks').select('id,primary_image_url').eq('id', row.artwork_id).single(),
      db.from('artwork_images').select('id,image_url,media_type').eq('artwork_id', row.artwork_id).order('display_order'),
      db.from('provenance_event_images_public').select('id,image_url').eq('artwork_id', row.artwork_id).order('display_order'),
    ])
    if (art.error || gallery.error || provenance.error) throw art.error || gallery.error || provenance.error
    return { preparation, production: publicProduction(row), artwork: art.data, savedSource: Boolean(row.source_image_ref?.url),
      gallery: gallery.data.filter(image => image.image_url && image.media_type !== 'video'),
      provenance: provenance.data.filter(image => image.image_url) }
  })
}

export function POST(request) {
  return admin(request, async (db, adminId) => {
    const input = await request.json().catch(() => null)
    const { preparation, row } = await selection(db, input || {})
    if (!row || input.revisionId !== row.revision_id) throw new HttpError(409, 'layout_changed')
    if (input.action === 'approve' && preparation) {
      const { data, error } = await db.rpc('approve_print_order_master', {
        _item: preparation.item_id, _revision: row.revision_id, _by: adminId,
      })
      if (error) throw error
      if (!data) throw new HttpError(409, 'approval_required')
      return { approved: true }
    }
    if (!['compare', 'generate', 'regenerate_preview'].includes(input.action) ||
      !['saved', 'primary', 'gallery', 'provenance', 'upload'].includes(input.source) ||
      (['gallery', 'provenance'].includes(input.source) && !isPrintId(input.imageId)) ||
      (input.source === 'upload' && !isPrintId(input.uploadId))) throw new HttpError(400, 'invalid_options')
    const { data: artwork, error } = await db.from('artworks').select('id,primary_image_url').eq('id', row.artwork_id).single()
    if (error) throw error
    const config = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, siteUrl: process.env.NEXT_PUBLIC_SITE_URL }
    if (input.action === 'regenerate_preview' && !preparation)
      return regenerateApprovedPrintPreview(db, artwork, row, adminId, input, config)
    if (input.action === 'regenerate_preview') throw new HttpError(400, 'invalid_options')
    return deferredPrintMaster(db, artwork, row, adminId, { ...input, generate: input.action === 'generate' }, config)
  })
}
