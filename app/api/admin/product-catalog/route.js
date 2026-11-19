import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { operations } from '@/lib/productCatalog/contracts'
import { catalogService } from '@/lib/productCatalog/service'
import { ProviderError } from '@/lib/productCatalog/providers'

const response = (data, status = 200, extra = {}) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store', ...extra },
})

export async function POST(request) {
  try {
    const { user } = await requireCertificateAdmin(request)
    const body = await request.json().catch(() => null)
    if (!body || typeof body.operation !== 'string' || !Object.hasOwn(operations, body.operation)) {
      return response({ error: 'invalid_operation' }, 400)
    }
    const input = operations[body.operation].schema.safeParse(body.input)
    if (!input.success) return response({ error: 'invalid_input', fields: input.error.issues.map(issue => issue.path.join('.')) }, 400)
    return response(await catalogService(serviceClient(), user.id)[body.operation](input.data))
  } catch (error) {
    if (error instanceof HttpError) return response({ error: error.code }, error.status)
    if (error instanceof ProviderError) return response({ error: error.code }, 502,
      error.retryAfter ? { 'Retry-After': error.retryAfter } : {})
    if (error.code === '23505') return response({ error: 'duplicate_catalog_record' }, 409)
    if (['23503','23514','22P02'].includes(error.code)) return response({ error: 'invalid_catalog_record' }, 400)
    if (['overlapping_price_entry','candidate_artwork_mismatch','incompatible_candidate','price_book_unavailable',
      'price_not_draft','price_book_has_no_approved_entries','invalid_review_transition','fulfillment_not_eligible',
      'fulfillment_already_claimed','quote_expired_or_mismatched','wall_art_session_invalid','wall_art_candidate_invalid','public_image_required'].includes(error.message)) return response({ error: error.message }, 409)
    console.error('[product-catalog]', error.code || error.name)
    return response({ error: 'catalog_unavailable' }, 503)
  }
}
