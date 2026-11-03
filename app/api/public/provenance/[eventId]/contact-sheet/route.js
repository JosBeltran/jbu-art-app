import sharp from 'sharp'
import { serviceClient } from '@/lib/offersAuth'
import { assetBytes } from '@/lib/social/assets.server'

export const runtime = 'nodejs'

const WIDTH = 1200
const HEIGHT = 630
const GAP = 18
const PAD = 24

function gridFor(count) {
  if (count <= 1) return { cols: 1, rows: 1 }
  if (count <= 4) return { cols: 2, rows: Math.ceil(count / 2) }
  return { cols: 3, rows: Math.ceil(Math.min(count, 6) / 3) }
}

export async function GET(_request, { params }) {
  const { eventId } = await params
  if (!eventId) return new Response('Not found', { status: 404 })

  const db = serviceClient()
  const { data: event } = await db.from('provenance_events')
    .select('id, visibility, event_type')
    .eq('id', eventId)
    .eq('visibility', 'PUBLIC')
    .maybeSingle()

  if (!event || ['PRICE_CHANGED', 'IMAGE_UPDATED', 'SEO_UPDATED', 'ARCHIVED', 'WITHDRAWN'].includes(event.event_type)) {
    return new Response('Not found', { status: 404 })
  }

  const { data: images, error } = await db.from('provenance_event_images')
    .select('id, image_url, display_order, created_at')
    .eq('provenance_event_id', eventId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(6)

  if (error || !images?.length) return new Response('Not found', { status: 404 })

  const loaded = []
  for (const image of images) {
    const bytes = await assetBytes(image.image_url)
    if (bytes) loaded.push(bytes)
  }
  if (!loaded.length) return new Response('Image unavailable', { status: 503 })

  const { cols, rows } = gridFor(loaded.length)
  const tileW = Math.floor((WIDTH - PAD * 2 - GAP * (cols - 1)) / cols)
  const tileH = Math.floor((HEIGHT - PAD * 2 - GAP * (rows - 1)) / rows)

  const composites = []
  for (let i = 0; i < loaded.length; i += 1) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const prepared = await sharp(loaded[i], { limitInputPixels: 60000000 })
      .rotate()
      .resize({ width: tileW, height: tileH, fit: 'contain', background: '#ffffff', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 94, mozjpeg: true })
      .toBuffer()

    composites.push({
      input: prepared,
      left: PAD + col * (tileW + GAP),
      top: PAD + row * (tileH + GAP)
    })
  }

  const output = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: '#ffffff' }
  })
    .composite(composites)
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer()

  return new Response(new Uint8Array(output), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
