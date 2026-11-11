import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { isPrintId, printImageFields, validatePrintForm } from '@/lib/printManager'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import { variantImage } from '@/lib/printImages'

const parentColumns = 'id,title,title_en,sku,primary_image_url,allows_prints,is_historical_version'

async function rows(query) {
  const all = []
  for (let start = 0; ; start += 200) {
    const { data, error } = await query().range(start, start + 199)
    if (error) throw error
    all.push(...data)
    if (data.length < 200) return all
  }
}

async function admin(request, action) {
  try {
    await requireCertificateAdmin(request)
    return Response.json(await action(serviceClient()), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.code }, { status: error.status })
    if (error.code === '23505' || error.message === 'duplicate_print_sku')
      return Response.json({ error: 'duplicate_print_sku' }, { status: 409 })
    if (['print_retry_conflict', 'print_identity_locked', 'invalid_print_inventory', 'print_parent_disabled', 'print_specs_locked'].includes(error.message))
      return Response.json({ error: error.message }, { status: 409 })
    if (['invalid_gallery_print_image', 'invalid_provenance_print_image'].includes(error.message))
      return Response.json({ error: 'invalid_print_image' }, { status: 400 })
    if (error.message === 'print_not_found' || error.message === 'artwork_not_found')
      return Response.json({ error: error.message }, { status: 404 })
    console.error('[admin prints]', error.code || error.message)
    return Response.json({ error: 'prints_unavailable' }, { status: 503 })
  }
}

export function GET(request) {
  return admin(request, async db => {
    const id = new URL(request.url).searchParams.get('artwork')
    if (id !== null) {
      if (!isPrintId(id)) throw new HttpError(400, 'invalid_print')
      const [gallery, provenance] = await Promise.all([
        rows(() => db.from('artwork_images').select('id,image_url,media_type,display_order,is_print_image')
          .eq('artwork_id', id).order('display_order').order('id')),
        rows(() => db.from('provenance_event_images_public').select('id,image_url,display_order')
          .eq('artwork_id', id).order('display_order').order('id')),
      ])
      return { gallery: gallery.filter(i => i.image_url && i.media_type !== 'video'), provenance }
    }
    const [artworks, variants, assets] = await Promise.all([
      rows(() => db.from('artworks').select(parentColumns).order('title').order('id')),
      rows(() => db.from('artwork_prints').select('*').order('sort_order').order('id')),
      rows(() => db.from('print_asset_generations').select('print_id,production_status,layout,effective_dpi')
        .eq('is_current', true).order('print_id')),
    ])
    const ids = new Set(variants.map(variant => variant.artwork_id))
    const printArtworks = artworks.filter(artwork => ids.has(artwork.id))
    const byId = new Map(printArtworks.map(artwork => [artwork.id, artwork]))
    const media = await getPrintMediaMap(db, printArtworks, variants, { includeInactive: true })
    const imageById = new Map(Object.values(media).flatMap(entry => entry.variants.map(v => [v.id, v])))
    const byPrint = new Map(assets.map(row => [row.print_id, row]))
    return {
      artworks,
      variants: variants.map(v => ({
        ...v, production: byPrint.get(v.id) || null, thumbnail: variantImage(imageById.get(v.id), byId.get(v.artwork_id)?.primary_image_url, media[v.artwork_id]?.gallery),
      })),
    }
  })
}

export function POST(request) {
  return admin(request, async db => {
    const input = await request.json().catch(() => null)
    let row
    try { row = validatePrintForm(input) } catch (error) { throw new HttpError(400, error.message) }
    const { data: artwork, error } = await db.from('artworks').select(parentColumns).eq('id', row.artwork_id).maybeSingle()
    if (error) throw error
    if (!artwork) throw new HttpError(404, 'artwork_not_found')
    if (row.is_active && artwork.is_historical_version && artwork.allows_prints !== true)
      throw new HttpError(409, 'print_parent_disabled')
    let previous
    if (!input.create) {
      const { data, error } = await db.from('artwork_prints').select('image_url,print_gallery_image_id,print_provenance_image_id').eq('id', row.id).maybeSingle()
      if (error) throw error
      previous = data
    }
    try {
      Object.assign(row, printImageFields(input.image_key, input.image_url, artwork, process.env.NEXT_PUBLIC_SUPABASE_URL, previous))
    } catch (error) {
      throw new HttpError(400, error.message)
    }
    const { data, error: saveError } = await db.rpc('save_admin_artwork_print', { _print: row, _create: input.create })
    if (saveError) throw saveError
    return { variant: data }
  })
}

export function PATCH(request) {
  return admin(request, async db => {
    const body = await request.json().catch(() => null)
    if (!isPrintId(body?.id)) throw new HttpError(400, 'invalid_print')
    const { data, error } = await db.from('artwork_prints').update({ is_active: false })
      .eq('id', body.id).select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new HttpError(404, 'print_not_found')
    return { id: data.id }
  })
}
