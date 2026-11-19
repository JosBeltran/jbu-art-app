// Utilidades del sistema de medios por obra (imágenes + video).
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const MAX_IMAGE_MB = 25
export const MAX_VIDEO_MB = 100

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i

export function resolveMediaUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

export function isVideoUrl(url) {
  return VIDEO_EXT.test(url || '')
}

/** Solo optimizamos con next/image los orígenes configurados (Supabase y archivos locales). */
export function canOptimize(url) {
  if (!url) return false
  if (url.startsWith('/')) return true
  try { return new URL(url).hostname.endsWith('.supabase.co') } catch { return false }
}

/** Artwork photography may be reused by a print. Explicit print media stays out of the original gallery. */
export function originalArtworkMediaRows(rows = []) {
  return rows.filter(row => row.is_print_image !== true && isOriginalMediaUrl(row.image_url))
}

function isOriginalMediaUrl(url) {
  return Boolean(url) && !/(?:^|\/)(?:print-previews|print-galleries|artwork-images\/prints)(?:\/|$)/i.test(url)
}

export function originalArtworkImage(artwork, rows = []) {
  const flagged = new Set(rows.filter(row => row.is_print_image === true).map(row => resolveMediaUrl(row.image_url)))
  const candidates = [artwork.primary_image_url, artwork.image_url, artwork.image, ...(artwork.secondary_images || []),
    ...originalArtworkMediaRows(rows).filter(row => row.media_type !== 'video')
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map(row => row.image_url)]
  return candidates.find(url => isOriginalMediaUrl(url) && !isVideoUrl(url) && !flagged.has(resolveMediaUrl(url))) || null
}

/**
 * Construye la lista ordenada de medios de una obra.
 * 1. Imagen principal (siempre primero, siempre imagen)
 * 2. secondary_images heredadas
 * 3. Filas de artwork_images en su orden (imagen o video)
 * 4. artworks.video_url si aún no está en la galería
 */
export function buildArtworkMedia(artwork, rows = [], t = (es) => es) {
  const title = artwork?.title || ''
  const items = []
  const seen = new Set()
  const push = (item) => {
    const url = resolveMediaUrl(item.url)
    if (!url || seen.has(url)) return
    seen.add(url)
    items.push({ ...item, url })
  }

  const originalRows = originalArtworkMediaRows(rows)
  const flagged = new Set(rows.filter(row => row.is_print_image === true).map(row => resolveMediaUrl(row.image_url)))
  const primary = originalArtworkImage(artwork || {}, rows)
  if (primary) {
    const primaryRow = originalRows.find(row => resolveMediaUrl(row.image_url) === resolveMediaUrl(primary))
    const discussion = primary === artwork.primary_image_url ? { kind: 'primary', ref: '' }
      : primaryRow?.id ? { kind: 'gallery', ref: primaryRow.id } : { kind: 'legacy', ref: primary }
    push({ type: 'image', url: primary, alt: `${title} — Josué Beltrán Uresti`, primary: true, discussion })
  }
  const rowByUrl = new Map(originalRows.filter(row => row.id && row.media_type !== 'video')
    .map(row => [resolveMediaUrl(row.image_url), row.id]))
  ;(artwork?.secondary_images || []).forEach((url) => {
    if (!isOriginalMediaUrl(url) || flagged.has(resolveMediaUrl(url))) return
    const id = rowByUrl.get(resolveMediaUrl(url))
    push({ type: 'image', url, discussion: id ? { kind: 'gallery', ref: id } : { kind: 'legacy', ref: url } })
  })
  ;[...originalRows]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .forEach((row) => {
      const type = row.media_type === 'video' || (!row.media_type && isVideoUrl(row.image_url)) ? 'video' : 'image'
      push({ type, url: row.image_url, poster: resolveMediaUrl(row.poster_url) || undefined, alt: row.alt_text || row.caption || '',
        discussion: type === 'image' && row.id ? { kind: 'gallery', ref: row.id } : null })
    })
  if (artwork?.video_url) push({ type: 'video', url: artwork.video_url })

  let view = 1
  return items.map((item) => {
    if (item.primary) return item
    view += 1
    const fallback = item.type === 'video'
      ? `${title} — ${t('video de la obra', 'artwork video')}`
      : `${title} — ${t('vista', 'view')} ${view}`
    return { ...item, alt: item.alt ? `${title} — ${item.alt}` : fallback }
  })
}
