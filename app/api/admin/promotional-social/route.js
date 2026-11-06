import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { allowedAssetUrl } from '@/lib/social/assets.server'
import { normalizePromoSettings } from '@/lib/social/promotional'
import { revalidatePath } from 'next/cache'

// Separate targeted write avoids losing artwork-sharing settings when editing
// page previews. Server authorization uses existing admin session validation.
export async function PUT(request) {
  try {
    await requireCertificateAdmin(request)
    const body = await request.json()
    const kind = body?.kind
    if (!['prints', 'catalog', 'series'].includes(kind)) throw new HttpError(400, 'invalid_page')
    const seriesId = kind === 'series' ? String(body.seriesId || '') : null
    if (kind === 'series' && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seriesId)) throw new HttpError(400, 'invalid_series')
    const input = body.settings
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'invalid_settings')
    const settings = normalizePromoSettings(input)
    if (settings.image_url && !allowedAssetUrl(settings.image_url)) throw new HttpError(400, 'invalid_image_url')
    if (settings.image_url && /token|signature|expires|x-amz-signature/i.test(new URL(settings.image_url).search))
      throw new HttpError(400, 'temporary_images_not_supported')

    const db = serviceClient()
    if (seriesId) {
      const { data: series, error } = await db.from('series').select('id').eq('id', seriesId).maybeSingle()
      if (error || !series) throw new HttpError(404, 'series_not_found')
    }

    const { data: current, error: readError } = await db.from('site_settings')
      .select('social_sharing').eq('id', true).maybeSingle()
    if (readError || !current) throw new HttpError(503, 'settings_unavailable')
    const config = current.social_sharing && typeof current.social_sharing === 'object' ? current.social_sharing : {}
    const target = kind === 'series' ? 'promotionalSeries' : 'promotionalPages'
    const key = seriesId || kind
    const next = { ...config, [target]: { ...config[target], [key]: settings } }
    const { error: saveError } = await db.from('site_settings')
      .update({ social_sharing: next, updated_at: new Date().toISOString() })
      .eq('id', true)
    if (saveError) throw new HttpError(503, 'settings_save_failed')
    if (kind === 'series') revalidatePath('/series/[slug]', 'page')
    else revalidatePath('/' + kind)
    return Response.json({ settings }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return Response.json({ error: error instanceof HttpError ? error.code : 'internal_error' }, { status })
  }
}
