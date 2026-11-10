import { sharedPrintContext } from '@/lib/social/print.server'
import { printShareLanguage } from '@/lib/social/print'
import { renderPrintSocialImage } from '@/lib/social/render.server'

export const runtime = 'nodejs'

export async function GET(request, { params }) {
  const { variantId } = await params
  const language = printShareLanguage(new URL(request.url).searchParams.get('lang'))
  try {
    const context = await sharedPrintContext(variantId, language)
    if (!context) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    const etag = '"' + context.revision + '-' + language + '"'
    const headers = { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=300, s-maxage=300',
      ETag: etag, 'X-Content-Type-Options': 'nosniff' }
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
    return new Response(new Uint8Array(await renderPrintSocialImage(context)), { headers })
  } catch (error) {
    console.error('[print-social] image generation failed', error?.code || error?.name)
    return new Response('Image temporarily unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
