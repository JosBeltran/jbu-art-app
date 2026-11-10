import { createHash, randomUUID } from 'node:crypto'
import { isPrintId, PRINT_EDITIONS } from './printManager.js'
import { BUCKET } from './mediaVariants.js'
import { inspectPrintSource, renderPrintAsset, renderPrintPreview } from './printAssetRender.server.js'
import { printAssetGeometry, printLayoutOptions, printLayoutPolicy, PrintAssetError } from './printAssetLayout.js'
import { canonicalPrintSize, MAX_PRINT_SOURCE_BYTES, PRINT_ASSET_SIZES, PRINT_MASTER_BUCKET } from './printAssetPresets.js'

const sizeKeys = Object.keys(PRINT_ASSET_SIZES)

export function printAssetRequestLayout(input, policy) {
  const sizes = input?.sizes
  if (!isPrintId(input?.requestId) || !Array.isArray(sizes) || !sizes.length || sizes.length > sizeKeys.length ||
    new Set(sizes).size !== sizes.length || sizes.some(size => !sizeKeys.includes(size)) ||
    !['primary', 'gallery', 'provenance', 'upload'].includes(input.source) ||
    (['gallery', 'provenance'].includes(input.source) && !isPrintId(input.imageId)) ||
    (input.source === 'upload' && !isPrintId(input.uploadId ?? input.requestId))) throw new PrintAssetError('invalid_options')
  return {
    requestId: input.requestId.toLowerCase(), sizes, source: input.source, imageId: input.imageId,
    uploadId: input.source === 'upload' ? (input.uploadId ?? input.requestId).toLowerCase() : null,
    layout: printLayoutOptions(input, policy),
  }
}

export function printAssetOptions(input, policy = printLayoutPolicy()) {
  const request = printAssetRequestLayout(input, policy)
  const { sizes } = request
  if (!PRINT_EDITIONS.includes(input.edition) || typeof input.replace !== 'boolean')
    throw new PrintAssetError('invalid_options')

  const title = input.title ?? ''
  const description = input.description ?? ''
  const price = input.price ?? ''
  const paper = input.paperType ?? ''
  if (typeof title !== 'string' || title.length > 200 || typeof description !== 'string' || description.length > 10000 ||
    typeof paper !== 'string' || paper.length > 200 ||
    (price !== '' && (!['string','number'].includes(typeof price) || !/^\d{1,8}(\.\d{1,2})?$/.test(String(price)) || Number(price) <= 0)))
    throw new PrintAssetError('invalid_options')

  const targets = Object.fromEntries(sizes.map(size => {
    const target = input.targets?.[size] || null
    if (target !== null && !isPrintId(target)) throw new PrintAssetError('invalid_options')
    return [size, target]
  }))
  const expectedRevisions = Object.fromEntries(sizes.map(size => {
    const revision = input.expectedRevisions?.[size] ?? null
    if (revision !== null && !isPrintId(revision)) throw new PrintAssetError('invalid_options')
    return [size, revision]
  }))
  const limit = input.edition === 'LIMITED' && sizes.some(size => !targets[size]) ? Number(input.editionLimit) : null
  if (limit !== null && (!['string', 'number'].includes(typeof input.editionLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 2147483647))
    throw new PrintAssetError('invalid_options')
  return {
    ...request, master: input.master === true, edition: input.edition, title: title.trim() || null, description: description.trim() || null, paper: paper.trim() || null,
    previewKey: input.previewKey, acceptLowDpi: input.acceptLowDpi === true, allowInterpolation: input.allowInterpolation === true,
    price: price === '' ? null : Number(price), limit, targets, expectedRevisions, replace: input.replace,
  }
}

export function printStagingPath(artworkId, adminId, requestId) {
  return 'staging/' + artworkId + '/' + adminId + '/' + requestId.toLowerCase() + '/source'
}

function trustedSourceUrl(raw, supabaseUrl, siteUrl) {
  const project = new URL(supabaseUrl)
  const site = new URL(siteUrl || 'https://www.josuebeltranuresti.com')
  const base = site.hostname === 'josuebeltranuresti.com' ? new URL('https://www.josuebeltranuresti.com') : site
  const source = new URL(raw, base)
  if (source.username || source.password || source.hash || source.search) throw new PrintAssetError('unsupported_source_location')
  if (source.origin === project.origin && source.pathname.startsWith('/storage/v1/object/public/artworks/')) return source
  if (source.origin === site.origin && site.hostname === 'josuebeltranuresti.com') source.hostname = base.hostname
  if (source.origin === base.origin && /^\/(?:assets(?:-optimized)?|images)\//.test(source.pathname)) return source
  throw new PrintAssetError('unsupported_source_location')
}

export async function readPublicSource(raw, config, fetchSource) {
  let url
  try { url = trustedSourceUrl(raw, config.supabaseUrl, config.siteUrl) }
  catch { throw new PrintAssetError('unsupported_source_location') }
  const response = await fetchSource(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) })
    .catch(() => null)
  if (!response?.ok || !response.body) throw new PrintAssetError('source_unavailable', 422)
  if (Number(response.headers.get('content-length')) > MAX_PRINT_SOURCE_BYTES) {
    await response.body.cancel()
    throw new PrintAssetError('source_too_large', 413)
  }
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > MAX_PRINT_SOURCE_BYTES) throw new PrintAssetError('source_too_large', 413)
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof PrintAssetError) throw error
    throw new PrintAssetError('source_unavailable', 422)
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks)
}

export async function readSource(db, artwork, options, staging, config, fetchSource) {
  if (staging) {
    const { data, error } = await db.storage.from(PRINT_MASTER_BUCKET).download(staging)
    if (error || !data) throw new PrintAssetError('source_unavailable', 422)
    if (data.size > MAX_PRINT_SOURCE_BYTES) throw new PrintAssetError('source_too_large', 413)
    return { input: Buffer.from(await data.arrayBuffer()), reference: { kind: 'upload' } }
  }
  let url = artwork.primary_image_url
  if (options.source !== 'primary') {
    const gallery = options.source === 'gallery'
    const { data, error } = await db.from(gallery ? 'artwork_images' : 'provenance_event_images_public')
      .select(gallery ? 'image_url,media_type' : 'image_url')
      .eq('artwork_id', artwork.id).eq('id', options.imageId).maybeSingle()
    if (error) throw error
    url = data?.media_type === 'video' ? null : data?.image_url
  }
  if (!url) throw new PrintAssetError('source_missing', 422)
  return {
    input: await readPublicSource(url, config, fetchSource),
    reference: { kind: options.source, image_id: options.imageId || null, url },
  }
}

export async function listPrintAssetVariants(db, artworkId) {
  const [variants, assets] = await Promise.all([
    db.from('artwork_prints').select('id,title,size,edition_type,finish,price,is_active,framing,paper_type')
      .eq('artwork_id', artworkId).eq('finish', 'FINE_ART').order('id'),
    db.from('print_asset_generations').select('print_id,revision_id,production_status,preview_image_url,effective_dpi,generated_at,layout')
      .eq('artwork_id', artworkId).eq('is_current', true),
  ])
  if (variants.error || assets.error) throw variants.error || assets.error
  const byPrint = new Map((assets.data || []).map(row => [row.print_id, row]))
  return (variants.data || []).filter(row => canonicalPrintSize(row.size)).map(row => ({
    ...row, format: canonicalPrintSize(row.size), generated: byPrint.get(row.id) || null,
  }))
}

function publicGeneration(row) {
  return { size: row.size, printId: row.print_id, preview: row.preview_image_url, effectiveDpi: row.layout?.effectiveDpi ?? row.effective_dpi, productionStatus: row.production_status, ok: true }
}

export async function removeFiles(bucket, paths) {
  try {
    const { error } = await bucket.remove(paths)
    if (error) console.error('[print assets] storage cleanup failed', error.code || error.name)
  } catch (error) {
    console.error('[print assets] storage cleanup failed', error.code || error.name)
  }
}

async function generateSize(db, artwork, adminId, options, size, target, source, geometry, render) {
  const attempt = randomUUID()
  const prefix = artwork.id + '/' + size.toLowerCase() + '/' + options.requestId + '/' + attempt
  const masterPath = options.master ? prefix + '/master.jpg' : null
  const previewPath = 'print-previews/' + prefix + '/preview.webp'
  const masters = db.storage.from(PRINT_MASTER_BUCKET)
  const previews = db.storage.from(BUCKET)
  const { master, preview } = options.master
    ? await render(source.input, geometry)
    : { preview: await renderPrintPreview(source.input, geometry) }
  const { width, height, left, top, artworkWidth, artworkHeight, sourceWidth, sourceHeight } = geometry
  const layout = {
    ...geometry, algorithmVersion: 1, fitStrategy: 'contain', crop: null, colorProfile: 'sRGB',
    orientation: width > height ? 'landscape' : 'portrait',
    normalizedPlacement: { x: left / width, y: top / height, width: artworkWidth / width, height: artworkHeight / height },
    sourceAspectRatio: sourceWidth / sourceHeight,
    minimumEffectiveDpi: geometry.targetDpi ?? geometry.effectiveDpi,
    paperType: options.paper || target?.paper_type || 'Prodigi Enhanced Matte Art 200 gsm',
    finish: 'FINE_ART', editionType: options.edition,
    interpolationApproved: options.allowInterpolation, lowDpiApproved: options.acceptLowDpi,
  }
  let removeAttempt = true
  try {
    if (masterPath) {
      const storedMaster = await masters.upload(masterPath, master, { contentType: 'image/jpeg', upsert: false })
      if (storedMaster.error) throw new PrintAssetError('storage_failed', 503)
    }
    const storedPreview = await previews.upload(previewPath, preview, { contentType: 'image/webp', upsert: false, cacheControl: '31536000' })
    if (storedPreview.error) throw new PrintAssetError('storage_failed', 503)
    const previewUrl = previews.getPublicUrl(previewPath).data.publicUrl

    // Once the RPC is sent, keep the assets if the outcome is ambiguous. Deleting
    // files from a committed transaction would leave a broken public option.
    removeAttempt = false
    const { data, error } = await db.rpc('commit_print_asset_revision', {
      _artwork: artwork.id, _request: options.requestId, _by: adminId, _new_print: randomUUID(),
      _size: size, _edition: options.edition, _selected: target?.id || null, _replace: options.replace,
      _expected_revision: target?.generated?.revision_id || null,
      _master: masterPath, _preview: previewUrl, _source: source.reference, _border: 'margin',
      _dpi: Math.floor(geometry.effectiveDpi), _layout: layout, _title: options.title, _description: options.description,
      _price: options.price, _limit: options.limit,
    })
    if (error || !data?.print_id) {
      removeAttempt = /^[0-9A-Z]{5}$/.test(error?.code || '')
      if (error?.message === 'generation_conflict' || error?.code === '23505') throw new PrintAssetError('generation_conflict', 409)
      console.error('[print assets] DB save failed', error?.code)
      throw new PrintAssetError('generation_save_failed', 503)
    }
    removeAttempt = data.preview_image_url !== previewUrl
    return publicGeneration(data)
  } finally {
    if (removeAttempt) await Promise.all([masterPath && removeFiles(masters, [masterPath]), removeFiles(previews, [previewPath])])
  }
}

function sourceStage(artwork, adminId, options) {
  return options.uploadId ? printStagingPath(artwork.id, adminId, options.uploadId) : null
}

async function planPrintAssets(db, artwork, adminId, options, config, policy, fetchSource) {
  const source = await readSource(db, artwork, options, sourceStage(artwork, adminId, options), config, fetchSource)
  source.reference.sha256 = createHash('sha256').update(source.input).digest('hex')
  const dimensions = await inspectPrintSource(source.input)
  const layouts = options.sizes.map(size => printAssetGeometry(size, options.layout, dimensions, policy))
  const previewKey = createHash('sha256').update(source.reference.sha256).update(JSON.stringify(layouts)).digest('hex')
  return { source, layouts, previewKey }
}

export async function previewArtworkPrintAssets(db, artwork, adminId, options, config, policy,
  { fetchSource = fetch } = {}) {
  const { source, layouts, previewKey } = await planPrintAssets(db, artwork, adminId, options, config, policy, fetchSource)
  const previews = []
  for (const layout of layouts) {
    const thumbnail = await renderPrintPreview(source.input, layout)
    previews.push({ ...layout, image: 'data:image/webp;base64,' + thumbnail.toString('base64') })
  }
  return { previews, previewKey }
}

export async function generateArtworkPrintAssets(db, artwork, adminId, options, config,
  { fetchSource = fetch, render = renderPrintAsset, policy = printLayoutPolicy() } = {}) {
  const staging = sourceStage(artwork, adminId, options)
  let consumed = false
  try {
    const { data, error } = await db.from('print_asset_generations').select('*')
      .eq('request_id', options.requestId).in('size', options.sizes)
    if (error) throw error
    if (data?.some(row => row.artwork_id !== artwork.id || row.generated_by !== adminId))
      throw new PrintAssetError('generation_conflict', 409)
    const saved = new Map((data || []).map(row => [row.size, publicGeneration(row)]))
    if (options.sizes.every(size => saved.has(size))) return options.sizes.map(size => saved.get(size))

    const variants = await listPrintAssetVariants(db, artwork.id)
    const targets = new Map()
    for (const size of options.sizes.filter(size => !saved.has(size))) {
      const matching = variants.filter(row => row.format === size && row.edition_type === options.edition)
      const selected = matching.find(row => row.id === options.targets[size])
      if ((matching.length && (!options.replace || !selected)) || (!matching.length && options.targets[size]) ||
        (selected?.generated?.revision_id ?? null) !== (options.expectedRevisions?.[size] ?? null))
        throw new PrintAssetError('generation_conflict', 409, { size })
      targets.set(size, selected)
    }
    const { source, layouts, previewKey } = await planPrintAssets(db, artwork, adminId, options, config, policy, fetchSource)
    if (options.previewKey !== previewKey) throw new PrintAssetError('preview_changed', 409)
    const pending = layouts.filter(layout => targets.has(layout.size))
    if (pending.some(layout => layout.mode === 'coverage' && layout.belowQuality) && !options.acceptLowDpi)
      throw new PrintAssetError('quality_confirmation_required')
    if (pending.some(layout => layout.interpolates) && !options.allowInterpolation)
      throw new PrintAssetError('interpolation_confirmation_required')
    const geometries = new Map(pending.map(layout => [layout.size, layout]))
    consumed = true
    for (const size of targets.keys()) {
      try {
        saved.set(size, await generateSize(db, artwork, adminId, options, size, targets.get(size), source, geometries.get(size), render))
      } catch (error) {
        if (!(error instanceof PrintAssetError)) console.error('[print assets] generation failed', error.code || error.name)
        saved.set(size, { size, ok: false, error: error instanceof PrintAssetError ? error.code : 'generation_failed' })
      }
    }
    return options.sizes.map(size => saved.get(size))
  } finally {
    if (staging && consumed) await removeFiles(db.storage.from(PRINT_MASTER_BUCKET), [staging])
  }
}
