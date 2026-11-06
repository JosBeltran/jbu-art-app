// Pure inventory collection. Run with a service-role database client, never in
// the browser: private/admin-only provenance is intentionally excluded from
// provenance_event_images_public.
export const SOURCES = Object.freeze({
  artworkPrimary: 'Artwork primary images',
  artworkGallery: 'Artwork gallery images',
  provenanceImages: 'Provenance event images',
  provenancePrimary: 'Provenance primary images',
})

const PAGE_SIZE = 500

export function normalizeMediaUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  try {
    const url = new URL(raw)
    if (!['https:', 'http:'].includes(url.protocol)) return raw
    url.hash = ''
    url.search = ''
    const decoded = decodeURIComponent(url.pathname)
    url.pathname = decoded.split('/').map(encodeURIComponent).join('/').replace(/%2F/gi, '/')
    return url.toString()
  } catch {
    return raw.split(/[?#]/, 1)[0]
  }
}

export async function paginateTable(db, table, columns, { pageSize = PAGE_SIZE } = {}) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    // Stable unique sort avoids skipping/duplicating rows across pages.
    const { data, error } = await db.from(table).select(columns)
      .order('id', { ascending: true }).range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Unable to read ${table}, rows ${offset}-${offset + pageSize - 1}: ${error.message || error.code || 'unknown error'}`)
    if (!Array.isArray(data)) throw new Error(`Unable to read ${table}: invalid response`)
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

export function buildMediaInventory({ artworks, artworkImages, provenanceImages, provenanceEvents }) {
  const counts = Object.fromEntries(Object.keys(SOURCES).map((k) => [k, 0]))
  const all = new Map()
  const byArtwork = new Map(artworks.map((a) => [a.id, { artwork: a, files: [] }]))
  const add = (artworkId, url, source, mediaType = 'image') => {
    const key = normalizeMediaUrl(url)
    if (!key) return
    counts[source]++
    // One physical URL is optimized only once, even when reused by multiple artworks.
    // Every reference retains its artwork_id and source for the audit.
    let job = all.get(key)
    if (!job) {
      job = { url: key, type: mediaType === 'video' ? 'video' : 'image', artwork_id: artworkId, references: [] }
      all.set(key, job)
    }
    const reference = { artwork_id: artworkId, source }
    if (!job.references.some((r) => r.artwork_id === artworkId && r.source === source)) job.references.push(reference)
    const entry = byArtwork.get(artworkId)
    if (entry && !entry.files.includes(job)) entry.files.push(job)
  }
  for (const a of artworks) add(a.id, a.primary_image_url, 'artworkPrimary')
  for (const r of artworkImages) add(r.artwork_id, r.image_url, 'artworkGallery', r.media_type === 'video' ? 'video' : 'image')
  for (const r of provenanceImages) add(r.artwork_id, r.image_url, 'provenanceImages')
  for (const r of provenanceEvents) add(r.artwork_id, r.primary_image_url, 'provenancePrimary')
  return {
    artworks: artworks.length,
    counts,
    references: Object.values(counts).reduce((sum, n) => sum + n, 0),
    duplicates: Object.values(counts).reduce((sum, n) => sum + n, 0) - all.size,
    jobs: [...all.values()],
    byArtwork: [...byArtwork.values()],
  }
}

export async function collectMediaInventory(db, options) {
  // Fail closed: never report complete results if any source query failed.
  const artworks = await paginateTable(db, 'artworks', 'id,sku,title,primary_image_url', options)
  const artworkImages = await paginateTable(db, 'artwork_images', 'id,artwork_id,image_url,media_type', options)
  const provenanceImages = await paginateTable(db, 'provenance_event_images', 'id,artwork_id,image_url', options)
  const provenanceEvents = await paginateTable(db, 'provenance_events', 'id,artwork_id,primary_image_url,visibility', options)
  return buildMediaInventory({ artworks, artworkImages, provenanceImages, provenanceEvents })
}
