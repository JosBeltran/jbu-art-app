import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { isCommerceId } from '@/lib/productCatalog/commerce'

const maxBytes = 4 * 1024 * 1024

export async function POST(request) {
  try {
    const { user } = await requireCertificateAdmin(request)
    if (Number(request.headers.get('content-length')) > maxBytes + 16384) throw new HttpError(413,'gallery_image_too_large')
    const form = await request.formData()
    const variant = form.get('variantId')
    const file = form.get('file')
    const altEs = String(form.get('altEs') || '').trim()
    const altEn = String(form.get('altEn') || '').trim()
    const source = form.get('source')
    if (!isCommerceId(variant) || !(file instanceof File) || file.size > maxBytes ||
      !altEs || !altEn || altEs.length > 240 || altEn.length > 240 || !['admin','jbu','provider'].includes(source) ||
      form.get('confirmed') !== 'on') throw new HttpError(400,'invalid_commercial_image')
    const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 32_000_000 })
    const metadata = await image.metadata().catch(() => null)
    if (!metadata || !['jpeg','png','webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1)
      throw new HttpError(400,'invalid_commercial_image')
    const db = serviceClient()
    const object = 'commercial-prints/' + variant + '/' + randomUUID() + '.webp'
    const storage = db.storage.from('artworks')
    const bytes = await image.rotate().resize({ width:1800, height:1800, fit:'inside', withoutEnlargement:true }).webp({ quality:86 }).toBuffer()
    const written = await storage.upload(object,bytes,{ contentType:'image/webp', cacheControl:'31536000' })
    if (written.error) throw written.error
    const inserted = await db.rpc('add_fine_art_commercial_image', {
      _actor:user.id,_variant:variant,_url:storage.getPublicUrl(object).data.publicUrl,
      _alt_es:altEs,_alt_en:altEn,_source:source,_primary:form.get('primary') === 'on',
    })
    if (inserted.error) {
      // Rejected SQL writes can be cleaned up. A transport failure may have
      // occurred after commit, so keep the object for reconciliation.
      if (['P0001','23503','23505','23514'].includes(inserted.error.code)) await storage.remove([object]).catch(() => {})
      throw new HttpError(409,inserted.error.message === 'publication_transition_invalid'
        ? 'publication_transition_invalid' : 'commercial_image_save_unavailable')
    }
    return Response.json({ id:inserted.data })
  } catch (error) {
    return Response.json({ error:error instanceof HttpError ? error.code : 'commercial_image_save_unavailable' },
      { status:error instanceof HttpError ? error.status : 503 })
  }
}
