import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { socialConfig } from '@/lib/social/config'
import { allowedAssetUrl } from '@/lib/social/assets.server'
import { revalidateTag } from 'next/cache'

export async function PUT(request) {
  try {
    const { user } = await requireCertificateAdmin(request)
    const body = await request.json()
    if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) throw new HttpError(400, 'invalid_config')
    const config = socialConfig(body.config)
    if (config.logoUrl && !allowedAssetUrl(config.logoUrl)) throw new HttpError(400, 'invalid_logo')
    const db = serviceClient()
    const { data: existing, error: readError } = await db.from('site_settings')
      .select('social_sharing').eq('id', true).maybeSingle()
    if (readError || !existing) throw new HttpError(503, 'settings_unavailable')
    // The artwork-sharing controls must not erase unrelated page preview metadata.
    const current = existing.social_sharing || {}
    const updated = {
      ...config,
      promotionalPages: current.promotionalPages || {},
      promotionalSeries: current.promotionalSeries || {},
    }
    const { data, error } = await db.from('site_settings').update({ social_sharing: updated, updated_by: user.id, updated_at: new Date().toISOString() }).eq('id', true).select('social_sharing').single()
    if (error || !data) throw new HttpError(503, 'settings_save_failed')
    revalidateTag('social-settings', { expire: 0 })
    return Response.json({ config: socialConfig(data.social_sharing) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    return Response.json({ error: error instanceof HttpError ? error.code : 'internal_error' }, { status })
  }
}
