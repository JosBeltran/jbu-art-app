import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { readPublicSource, readSource, removeFiles, printStagingPath } from './printAssetGeneration.server.js'
import { inspectPrintSource, printPreviewPlacement, PRINT_PREVIEW_PADDING, renderPrintMaster, renderPrintPreview } from './printAssetRender.server.js'
import { PrintAssetError } from './printAssetLayout.js'
import { BUCKET } from './mediaVariants.js'
import { PRINT_MASTER_BUCKET } from './printAssetPresets.js'

export const publicProduction = row => ({
  revisionId: row.revision_id, status: row.production_status, preview: row.preview_image_url,
  layout: row.layout, size: row.size, effectiveDpi: row.layout?.effectiveDpi ?? row.effective_dpi,
  hasMaster: Boolean(row.production_file_path), error: row.master_error || null, canGenerate: row.layout?.algorithmVersion === 1,
})

async function framingDifference(approved, proposed, layout) {
  const { x, y, imageWidth, imageHeight } = printPreviewPlacement(layout)
  const area = { left: x + PRINT_PREVIEW_PADDING, top: y + PRINT_PREVIEW_PADDING, width: imageWidth, height: imageHeight }
  const pixels = bytes => sharp(bytes).extract(area).resize(128, 128, { fit: 'fill' })
    .toColourspace('srgb').removeAlpha().raw().toBuffer()
  const [before, after] = await Promise.all([pixels(approved), pixels(proposed)])
  let total = 0
  let changed = 0
  for (let i = 0; i < before.length; i += 3) {
    const distance = (Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) +
      Math.abs(before[i + 2] - after[i + 2])) / 3
    total += distance
    if (distance > 32) changed++
  }
  const count = before.length / 3
  return total / count > 8 || changed / count > 0.08
}

export async function assessMasterSource(layout, input, approvedPreview, original) {
  const { width, height } = await inspectPrintSource(input)
  const effectiveDpi = Math.min(width * 25.4 / layout.artworkWidthMm, height * 25.4 / layout.artworkHeightMm)
  const image = await renderPrintPreview(input, layout)
  const errors = []
  if (layout.fitStrategy !== 'contain' || layout.crop != null || Math.abs((width / height) / layout.sourceAspectRatio - 1) > 0.0025)
    errors.push('aspect_mismatch')
  if (effectiveDpi + 1e-8 < layout.minimumEffectiveDpi ||
      (!layout.interpolationApproved && (width < layout.artworkWidth || height < layout.artworkHeight)))
    errors.push('insufficient_resolution')
  if (!original && await framingDifference(approvedPreview, image, layout)) errors.push('framing_mismatch')
  return { effectiveDpi, width, height, image, errors }
}

function deferredUploadPath(artwork, adminId, options) {
  return options.source === 'upload' ? printStagingPath(artwork.id, adminId, options.uploadId) : null
}

async function productionSource(db, artwork, row, options, upload, config, fetchSource) {
  let source
  if (options.source === 'saved') {
    const ref = row.source_image_ref
    if (!ref?.url) throw new PrintAssetError('source_reupload_required', 422)
    source = { input: await readPublicSource(ref.url, config, fetchSource), reference: ref }
  } else {
    source = await readSource(db, artwork, options, upload, config, fetchSource)
  }
  const sha256 = createHash('sha256').update(source.input).digest('hex')
  return { source, sha256 }
}

export async function regenerateApprovedPrintPreview(db, artwork, row, adminId, options, config, { fetchSource = fetch } = {}) {
  const upload = deferredUploadPath(artwork, adminId, options)
  try {
    if (row.layout?.algorithmVersion !== 1) throw new PrintAssetError('layout_unavailable', 409)
    const { source, sha256 } = await productionSource(db, artwork, row, options, upload, config, fetchSource)
    if (sha256 !== row.source_image_ref.sha256) throw new PrintAssetError('original_source_required', 422)
    const preview = new URL(row.preview_image_url)
    const prefix = '/storage/v1/object/public/artworks/'
    const path = preview.pathname.slice(prefix.length)
    if (preview.origin !== new URL(config.supabaseUrl).origin || !preview.pathname.startsWith(prefix) ||
      !path.startsWith('print-previews/' + artwork.id + '/') || !path.endsWith('/preview.webp'))
      throw new PrintAssetError('unsupported_source_location', 422)
    const image = await renderPrintPreview(source.input, row.layout)
    const { error } = await db.storage.from(BUCKET).upload(path, image, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: true,
    })
    if (error) throw new PrintAssetError('storage_failed', 503)
    return { regenerated: true }
  } finally {
    if (upload) await removeFiles(db.storage.from(PRINT_MASTER_BUCKET), [upload])
  }
}

export async function deferredPrintMaster(db, artwork, row, adminId, options, config, {
  fetchSource = fetch, renderMaster = renderPrintMaster,
} = {}) {
  const upload = deferredUploadPath(artwork, adminId, options)
  try {
    if (row.layout?.algorithmVersion !== 1) throw new PrintAssetError('layout_unavailable', 409)
    if (row.production_status === 'MASTER_READY') return { production: publicProduction(row) }
    const { source, sha256 } = await productionSource(db, artwork, row, options, upload, config, fetchSource)
    const sameSource = sha256 === row.source_image_ref.sha256
    const approved = sameSource ? null : await readPublicSource(row.preview_image_url, config, fetchSource)
    const { image, errors, ...quality } = await assessMasterSource(row.layout, source.input, approved, sameSource)
    const key = createHash('sha256').update(row.revision_id).update(sha256).digest('hex')
    if (!options.generate) return { ...quality, errors, key, image: 'data:image/webp;base64,' + image.toString('base64') }
    if (errors.length) throw new PrintAssetError(errors[0], 422)
    if (key !== options.key || options.confirm !== true) throw new PrintAssetError('preview_changed', 409)

    const lease = randomUUID()
    const { data: claimed, error: claimError } = await db.rpc('claim_print_master', { _revision: row.revision_id, _lease: lease })
    if (claimError) throw claimError
    if (!claimed) throw new PrintAssetError('master_busy', 409)

    const path = 'revisions/' + row.revision_id + '/' + lease + '/master.jpg'
    const bucket = db.storage.from(PRINT_MASTER_BUCKET)
    const finish = async (master, ref, error) => db.rpc('complete_print_master', {
      _revision: row.revision_id, _lease: lease, _path: master, _source: ref, _error: error,
    })
    let commitSent = false
    try {
      const master = await renderMaster(source.input, row.layout)
      const { error } = await bucket.upload(path, master, { contentType: 'image/jpeg', upsert: false })
      if (error) throw new PrintAssetError('storage_failed', 503)
      commitSent = true
      const result = await finish(path, { ...source.reference, sha256, ...quality }, null)
      if (result.error) {
        commitSent = !/^[0-9A-Z]{5}$/.test(result.error.code || '')
        throw result.error
      }
      if (!result.data) {
        commitSent = false
        throw new PrintAssetError('master_busy', 409)
      }
      return { production: publicProduction({ ...row, production_status: 'MASTER_READY', production_file_path: path }) }
    } catch (error) {
      // A lost response may follow a successful commit. Never remove a referenced master.
      if (!commitSent) {
        await removeFiles(bucket, [path])
        await finish(null, null, error instanceof PrintAssetError ? error.code : 'master_failed')
      }
      throw error
    }
  } finally {
    if (upload) await removeFiles(db.storage.from(PRINT_MASTER_BUCKET), [upload])
  }
}
