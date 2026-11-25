import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { PRINT_SIZE_CATALOG, artworkPrintSize } from './artworkPrintSizes.js'
import { inspectPrintSource, renderPrintPreview } from './printAssetRender.server.js'
import { readPublicSource, readSource } from './printAssetGeneration.server.js'
import { PrintAssetError } from './printAssetLayout.js'

export async function inspectArtworkPrintMaster(db, print, current, adminId, uploadId, config, {
  inspect = inspectPrintSource, read = readSource, renderPreview = renderPrintPreview, fetchSource = fetch,
} = {}) {
  const size = artworkPrintSize(print)
  const preset = PRINT_SIZE_CATALOG[size]
  if (!preset) throw new PrintAssetError('invalid_print_size')
  const staging = 'staging/' + print.artwork_id + '/' + adminId + '/' + uploadId.toLowerCase() + '/source'
  const { input } = await read(db, { id:print.artwork_id }, { source:'upload' }, staging, config, fetchSource)
  const { width, height } = await inspect(input)
  const horizontal = width > height
  const [paperWidthMm, paperHeightMm] = horizontal ? [...preset.mm].reverse() : preset.mm
  const dpi = 25.4 * Math.min(width / paperWidthMm, height / paperHeightMm)
  if (Math.abs((width / height) / (paperWidthMm / paperHeightMm)-1)>0.0025)
    throw new PrintAssetError('aspect_mismatch', 422)
  const expected = current?.layout
  if (expected && (Math.abs(expected.paperWidthMm-paperWidthMm)>1 || Math.abs(expected.paperHeightMm-paperHeightMm)>1))
    throw new PrintAssetError('aspect_mismatch', 422)
  if (dpi + 0.5 < Math.max(150, Number(expected?.outputDpi) || 150))
    throw new PrintAssetError('insufficient_resolution', 422)
  const layout = { algorithmVersion:2, size, width, height, left:0, top:0, artworkWidth:width, artworkHeight:height,
    sourceWidth:width, sourceHeight:height, sourceAspectRatio:width/height, paperWidthMm, paperHeightMm,
    artworkWidthMm:paperWidthMm, artworkHeightMm:paperHeightMm, outputDpi:Math.round(dpi), effectiveDpi:dpi,
    minimumEffectiveDpi:150, fitStrategy:'contain', crop:null, colorProfile:'sRGB',
    marginsMm:{top:0,right:0,bottom:0,left:0}, paperType:print.paper_type || null }
  const thumbnail = await renderPreview(input, layout)
  if (expected?.algorithmVersion === 1) {
    const approved = await readPublicSource(current.preview_image_url, config, fetchSource)
    const pixels = bytes => sharp(bytes).resize(128,128,{fit:'fill'}).flatten({background:'#ffffff'}).removeAlpha().raw().toBuffer()
    const [before,after] = await Promise.all([pixels(approved),pixels(thumbnail)])
    let distance=0, changed=0
    for(let i=0;i<before.length;i++) { const delta=Math.abs(before[i]-after[i]);distance+=delta;if(delta>32)changed++ }
    if(distance/before.length>8 || changed/before.length>0.08) throw new PrintAssetError('framing_mismatch',422)
  }
  const sha = createHash('sha256').update(input).digest('hex')
  const key = createHash('sha256').update(JSON.stringify([print.id,size,current?.revision_id || null,sha])).digest('hex')
  return { key, sha, layout, dpi, staging, thumbnail, size }
}

