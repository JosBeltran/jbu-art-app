import { allowedAssetUrl, assetBytes } from '@/lib/social/assets.server'
import { imageVariants } from '@/lib/mediaVariants'
import { watermarkArtwork } from '@/lib/artworkWatermark'

export const runtime = 'nodejs'

export async function GET(request) {
  const source = new URL(request.url).searchParams.get('source')
  const url = source && source.length <= 2000 ? allowedAssetUrl(source) : null
  const sourcePath = url?.pathname || ''
  const artworkPath = sourcePath.startsWith('/storage/v1/object/public/artworks/')
    || sourcePath.startsWith('/images/') || sourcePath.startsWith('/assets-optimized/')
  if (!artworkPath || !/\.(avif|gif|jpe?g|png|webp)$/i.test(sourcePath)) {
    return new Response(null, { status: 404 })
  }

  try {
    const optimized = imageVariants(url.href)?.large
    const input = (optimized && await assetBytes(optimized)) || await assetBytes(url.href)
    if (!input) return new Response(null, { status: 404 })
    const image = await watermarkArtwork(input)
    return new Response(new Uint8Array(image), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 422 })
  }
}
