import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { isPrintId } from '@/lib/printManager'
import { printLayoutPolicy, PrintAssetError } from '@/lib/printAssetLayout'
import { generateArtworkPrintAssets, listPrintAssetVariants, previewArtworkPrintAssets, printAssetOptions, printAssetRequestLayout, printStagingPath } from '@/lib/printAssetGeneration.server'
import { MAX_PRINT_SOURCE_BYTES, PRINT_MASTER_BUCKET, PRINT_SOURCE_TYPES } from '@/lib/printAssetPresets'

export const runtime = 'nodejs'
export const maxDuration = 120

const noStore = { 'Cache-Control': 'no-store' }

async function withAdmin(request, context, action) {
  try {
    const { user } = await requireCertificateAdmin(request)
    const { id } = await context.params
    if (!isPrintId(id)) throw new HttpError(400, 'invalid_artwork')
    const db = serviceClient()
    const { data: artwork, error } = await db.from('artworks').select('id,primary_image_url').eq('id', id).maybeSingle()
    if (error) throw error
    if (!artwork) throw new HttpError(404, 'artwork_not_found')
    return Response.json(await action(db, artwork, user.id), { headers: noStore })
  } catch (error) {
    if (error instanceof PrintAssetError || error instanceof HttpError)
      return Response.json({ error: error.code, details: error.details }, { status: error.status, headers: noStore })
    console.error('[print assets]', error?.code || error?.name)
    return Response.json({ error: 'generation_unavailable' }, { status: 503, headers: noStore })
  }
}

export function GET(request, context) {
  return withAdmin(request, context, async (db, artwork) => {
    const master = new URL(request.url).searchParams.get('master')
    if (master !== null) {
      if (!isPrintId(master)) throw new HttpError(400, 'invalid_options')
      const { data, error } = await db.from('print_asset_generations').select('production_file_path,size,layout')
        .eq('artwork_id', artwork.id).eq('print_id', master).eq('is_current', true).maybeSingle()
      if (error) throw error
      if (!data) throw new HttpError(404, 'master_not_found')
      const { data: signed, error: signError } = await db.storage.from(PRINT_MASTER_BUCKET)
        .createSignedUrl(data.production_file_path, 300, { download: 'JBU-' + data.size + '-' + (data.layout?.outputDpi ?? 300) + 'dpi.jpg' })
      if (signError || !signed?.signedUrl) throw new HttpError(503, 'storage_failed')
      return { url: signed.signedUrl }
    }

    const [gallery, provenance, variants] = await Promise.all([
      db.from('artwork_images').select('id,image_url,media_type').eq('artwork_id', artwork.id).order('display_order'),
      db.from('provenance_event_images_public').select('id,image_url').eq('artwork_id', artwork.id).order('display_order'),
      listPrintAssetVariants(db, artwork.id),
    ])
    if (gallery.error || provenance.error) throw gallery.error || provenance.error
    return {
      primary: artwork.primary_image_url,
      policy: printLayoutPolicy(),
      gallery: (gallery.data || []).filter(row => row.image_url && row.media_type !== 'video'),
      provenance: (provenance.data || []).filter(row => row.image_url),
      variants: variants.map(({ generated, ...row }) => ({
        ...row,
        generated: generated && { preview: generated.preview_image_url, effectiveDpi: generated.layout?.effectiveDpi ?? generated.effective_dpi },
      })),
    }
  })
}

export function POST(request, context) {
  return withAdmin(request, context, async (db, artwork, adminId) => {
    const input = await request.json().catch(() => null)
    if (input?.action === 'upload') {
      if (!isPrintId(input.requestId) || !PRINT_SOURCE_TYPES.includes(input.type) ||
        !Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_PRINT_SOURCE_BYTES)
        throw new HttpError(400, 'invalid_upload')
      const path = printStagingPath(artwork.id, adminId, input.requestId)
      const { data, error } = await db.storage.from(PRINT_MASTER_BUCKET).createSignedUploadUrl(path)
      if (error || !data?.token) throw new HttpError(503, 'storage_failed')
      return { path, token: data.token }
    }
    const policy = printLayoutPolicy()
    const config = { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, siteUrl: process.env.NEXT_PUBLIC_SITE_URL }
    if (input?.action === 'preview') {
      return previewArtworkPrintAssets(db, artwork, adminId, printAssetRequestLayout(input, policy), config, policy)
    }
    const results = await generateArtworkPrintAssets(db, artwork, adminId, printAssetOptions(input, policy), config, { policy })
    return { results }
  })
}
