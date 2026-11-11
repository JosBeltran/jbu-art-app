import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const version = /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION || '')
  ? process.env.META_GRAPH_API_VERSION
  : 'v27.0'

const pages = () => ({
  test: { id: process.env.META_TEST_PAGE_ID, token: process.env.META_TEST_PAGE_ACCESS_TOKEN },
  main: { id: process.env.META_PAGE_ID, token: process.env.META_PAGE_ACCESS_TOKEN },
})

function pageFor(key) {
  if (!['test', 'main'].includes(key)) throw new HttpError(400, 'invalid_page')
  const page = pages()[key]
  if (!/^\d+$/.test(page.id || '') || !page.token) throw new HttpError(503, 'page_not_configured')
  return page
}

function publicArtworkUrl(sku) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://josuebeltranuresti.com'
  const parsed = new URL(origin)
  if (parsed.protocol !== 'https:') throw new HttpError(503, 'site_url_not_https')
  return new URL('/artwork/' + encodeURIComponent(sku), parsed.origin).toString()
}

function fail(error) {
  if (!(error instanceof HttpError)) console.error('[facebook publishing]', error?.message || 'unexpected_error')
  return Response.json({ error: error instanceof HttpError ? error.code : 'facebook_unavailable' }, {
    status: error instanceof HttpError ? error.status : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request) {
  try {
    await requireCertificateAdmin(request)
    const db = serviceClient()
    const [artworksResult, postsResult] = await Promise.all([
      db.from('artworks').select('id,sku,title,title_en,primary_image_url').order('title').limit(500),
      db.from('artwork_facebook_posts')
        .select('id,artwork_id,page_id,facebook_post_id,message,permalink,state,created_at')
        .order('created_at', { ascending: false }).limit(50),
    ])
    if (artworksResult.error || postsResult.error) throw new HttpError(503, 'facebook_storage_unavailable')
    return Response.json({
      artworks: artworksResult.data || [],
      posts: postsResult.data || [],
      pages: { test: Boolean(pages().test.id && pages().test.token), main: Boolean(pages().main.id && pages().main.token) },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return fail(error) }
}

export async function POST(request) {
  try {
    const { user } = await requireCertificateAdmin(request)
    const input = await request.json().catch(() => null)
    if (!input || typeof input !== 'object') throw new HttpError(400, 'invalid_request')
    const { artworkId, page: target, publish, confirmation } = input
    if (!/^[0-9a-f-]{36}$/i.test(artworkId || '')) throw new HttpError(400, 'invalid_artwork')
    if (typeof publish !== 'boolean') throw new HttpError(400, 'invalid_publication_mode')
    // Prevent accidental posts on the real Page. There is no default publish path.
    if (publish && confirmation !== (target === 'main' ? 'PUBLISH_MAIN' : 'PUBLISH_TEST'))
      throw new HttpError(400, 'publication_confirmation_required')
    const selected = pageFor(target)
    const message = String(input.message || '').trim()
    if (!message || message.length > 2000) throw new HttpError(400, 'invalid_message')
    const db = serviceClient()
    const { data: artwork, error: lookupError } = await db.from('artworks')
      .select('id,sku,title').eq('id', artworkId).maybeSingle()
    if (lookupError) throw new HttpError(503, 'artwork_lookup_failed')
    if (!artwork?.sku) throw new HttpError(404, 'artwork_not_found')

    // Fail closed before posting when the migration has not yet been installed.
    const { error: storageError } = await db.from('artwork_facebook_posts').select('id').limit(1)
    if (storageError) throw new HttpError(503, 'facebook_storage_unavailable')

    const url = `https://graph.facebook.com/${version}/${selected.id}/feed`
    const payload = new URLSearchParams({
      message,
      link: publicArtworkUrl(artwork.sku),
      published: publish ? 'true' : 'false',
      access_token: selected.token,
    })
    let graph
    try {
      const response = await fetch(url, { method: 'POST', body: payload, cache: 'no-store', signal: AbortSignal.timeout(15000) })
      graph = await response.json()
      if (!response.ok || !graph?.id) {
        console.error('[facebook publishing] Graph rejected request', { status: response.status, code: graph?.error?.code })
        throw new HttpError(502, 'facebook_post_failed')
      }
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(502, 'facebook_post_failed')
    }
    const { data: saved, error: saveError } = await db.from('artwork_facebook_posts').insert({
      artwork_id: artwork.id, page_id: selected.id, facebook_post_id: graph.id,
      message, state: publish ? 'PUBLISHED' : 'UNPUBLISHED', created_by: user.id,
    }).select('id,facebook_post_id,state').single()
    if (saveError) {
      console.error('[facebook publishing] Meta post created but local persistence failed', { facebookPostId: graph.id })
      // Return the FB id for manual reconciliation rather than falsely reporting full success.
      return Response.json({ error: 'facebook_post_created_save_failed', facebookPostId: graph.id }, { status: 502 })
    }
    return Response.json({ post: saved }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return fail(error) }
}
