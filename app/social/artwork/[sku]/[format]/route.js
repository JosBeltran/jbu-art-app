import { loadSocialArtwork, socialContext } from '@/lib/social/data.server'
import { renderSocialImage } from '@/lib/social/render.server'
import { SOCIAL_FORMATS } from '@/lib/social/config'

export const runtime = 'nodejs'
export async function GET(request, { params }) {
  const { sku, format } = await params
  if (!Object.hasOwn(SOCIAL_FORMATS, format) || !sku || sku.length > 120) return new Response('Not found', { status: 404 })
  try {
    const artwork = await loadSocialArtwork(sku)
    if (!artwork) return new Response('Not found', { status: 404 })
    const lang = new URL(request.url).searchParams.get('lang') === 'en' ? 'en' : 'es'
    const context = await socialContext(artwork, lang)
    if (format !== 'horizontal' && !context.config[format].enabled) return new Response('Format disabled', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    const bytes = await renderSocialImage(artwork, context, format)
    const etag = `"${context.version}-${format}-${lang}"`
    const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600', ETag: etag, 'X-Content-Type-Options': 'nosniff' }
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
    return new Response(new Uint8Array(bytes), { headers })
  } catch (error) {
    console.error('[social-image] generation failed', error?.stack)
    // Separate endpoint: failures never break the artwork detail or metadata.
    return new Response('Image temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
