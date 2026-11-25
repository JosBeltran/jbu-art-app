import sharp from 'sharp'
import {printImageMetadata} from '@/lib/printImageMetadata.server'
import {PRINT_SIZE_CATALOG} from '@/lib/artworkPrintSizes'
import {duplicatePrintPresentations} from '@/lib/printPresentation'
import { randomUUID } from 'node:crypto'
import { BUCKET, IMAGE_VARIANTS, variantFolder } from '@/lib/mediaVariants'
import { PRINT_GALLERY_LIMIT, PRINT_GALLERY_UPLOAD_LIMIT, printGalleryPrefix } from '@/lib/printGallery'
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
    if (error.message === 'invalid_print_size') return Response.json({ error: error.message }, { status: 400 })
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
      duplicatePresentations:duplicatePrintPresentations(variants),
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
    if(!row.orientation) {
      const meta=await printImageMetadata(row.image_url || artwork.primary_image_url)
      if(meta)row.orientation=meta.orientation
    }
    if(row.image_url && input.image_key==='upload') {
      const meta=await printImageMetadata(row.image_url),preset=PRINT_SIZE_CATALOG[row.size_code]
      if(meta) {
        row.preview_width_px=meta.width_px;row.preview_height_px=meta.height_px
        row.orientation=meta.orientation
        row.preview_is_prepared=Boolean(preset && Math.abs(Math.min(meta.width_px,meta.height_px)/Math.max(meta.width_px,meta.height_px)-Math.min(...preset.mm)/Math.max(...preset.mm))<0.005)
      }
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


export function PUT(request) {
  return admin(request, async db => {
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      if (Number(request.headers.get('content-length')) > PRINT_GALLERY_UPLOAD_LIMIT + 16384)
        throw new HttpError(413, 'gallery_image_too_large')
      const form = await request.formData().catch(() => null)
      const id = form?.get('id')
      const file = form?.get('file')
      if (!isPrintId(id) || !(file instanceof File)) throw new HttpError(400, 'invalid_print_image')
      if (file.size > PRINT_GALLERY_UPLOAD_LIMIT) throw new HttpError(413, 'gallery_image_too_large')
      const { data: variant, error } = await db.from('artwork_prints').select('id').eq('id', id).maybeSingle()
      if (error) throw error
      if (!variant) throw new HttpError(404, 'print_not_found')

      const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 32_000_000 })
      const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' }
      const metadata = await image.metadata().catch(() => null)
      if (!metadata || !Object.hasOwn(formats, file.type) || metadata.format !== formats[file.type] || (metadata.pages ?? 1) !== 1)
        throw new HttpError(400, 'invalid_print_image')

      const path = printGalleryPrefix(variant.id) + randomUUID() + '.webp'
      const storage = db.storage.from(BUCKET)
      const derivatives = await Promise.all(IMAGE_VARIANTS.map(async ({ name, width, quality }) => ({
        name,
        bytes: await image.clone().rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
          .webp({ quality }).toBuffer(),
      }))).catch(() => { throw new HttpError(400, 'invalid_print_image') })
      const options = { contentType: 'image/webp', cacheControl: '31536000', upsert: false }
      const written = []
      try {
        for (const { name, bytes } of derivatives) {
          const derivativePath = `${variantFolder(path)}/${name}.webp`
          const { error } = await storage.upload(derivativePath, bytes, options)
          if (error) throw error
          written.push(derivativePath)
        }
        const { error } = await storage.upload(path, derivatives.find(image => image.name === 'large').bytes, options)
        if (error) throw error
      } catch (error) {
        if (written.length) await storage.remove(written).catch(() => {})
        throw error
      }
      return { url: storage.getPublicUrl(path).data.publicUrl }
    }

    const body = await request.json().catch(() => null)
    if (!isPrintId(body?.id) || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
        !Array.isArray(body.images) || body.images.length > PRINT_GALLERY_LIMIT)
      throw new HttpError(400, 'invalid_print_image')

    const id = body.id.toLowerCase()
    const storage = db.storage.from(BUCKET)
    const prefix = printGalleryPrefix(id)
    const base = storage.getPublicUrl(prefix).data.publicUrl.replace(/\/?$/, '/')
    const seen = new Set()
    const images = body.images.map(entry => {
      const url = entry?.url
      const filename = typeof url === 'string' && url.startsWith(base) ? url.slice(base.length) : ''
      if ((url !== null && !/^[a-f0-9-]{36}\.webp$/.test(filename)) || seen.has(url))
        throw new HttpError(400, 'invalid_print_image')
      seen.add(url)
      return {
        url,
        alt_es: typeof entry.alt_es === 'string' ? entry.alt_es.trim().slice(0, 250) : '',
        alt_en: typeof entry.alt_en === 'string' ? entry.alt_en.trim().slice(0, 250) : '',
      }
    })
    await Promise.all(images.filter(image => image.url).map(async image => {
      const { data: exists } = await storage.exists(prefix + image.url.slice(base.length))
      if (!exists) throw new HttpError(400, 'invalid_print_image')
    }))
    const { data, error } = await db.from('artwork_prints')
      .update({ gallery_images: images, gallery_revision: body.revision + 1 })
      .eq('id', id).eq('gallery_revision', body.revision)
      .select('gallery_images,gallery_revision').maybeSingle()
    if (error) throw error
    if (!data) throw new HttpError(409, 'print_gallery_conflict')
    return data
  })
}

