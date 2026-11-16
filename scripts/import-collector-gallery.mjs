import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { GALLERY_BUCKET, prepareGalleryPhoto, saveGalleryPhoto } from '../lib/collectorGalleryMedia.mjs'

const repository = 'JosBeltran/JosBeltran.github.io'
const revision = '2788952e226b265fca15b346fc183fa1479a48b9'
const assets = [
  ['CL1.jpg', '9feb5f7f7ef392f822cb35e1563e79c059eda0de'],
  ['CL2.jpg', 'ca0b40257ccf9229eead4b256a69d3f51182b8d4'],
  ['CL3.jpg', 'ab137f8d0410683dbe20de47b4475c47434b49c4'],
  ['CL4.jpg', '2a723f2b454604b916d4ce4acf54fe61b99de84a'],
]

export async function importGallery(db, fetchAsset = fetch) {
  const table = db.from('collector_gallery_entries')
  const bucket = db.storage.from(GALLERY_BUCKET)
  const summary = { imported: 0, skipped: 0 }
  for (const [position, [name, expectedHash]] of assets.entries()) {
    const path = `assets/clientes/${name}`
    const provenance = `${repository}/${path}`
    const existing = await table.select('id').eq('legacy_path', provenance).maybeSingle()
    if (existing.error) throw existing.error
    if (existing.data) { summary.skipped++; continue }
    const response = await fetchAsset(`https://raw.githubusercontent.com/${repository}/${revision}/${path}`, {
      redirect: 'error', signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Could not download ${path} (HTTP ${response.status})`)
    const original = Buffer.from(await response.arrayBuffer())
    const hash = createHash('sha1').update(`blob ${original.length}\0`).update(original).digest('hex')
    if (hash !== expectedHash) throw new Error(`Original checksum mismatch for ${path}`)
    const photo = await prepareGalleryPhoto(original, 'image/jpeg')
    const hex = createHash('sha256').update(provenance).digest('hex')
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
    await saveGalleryPhoto(bucket, id, photo, original)
    const { data, error } = await table.upsert({
      id, source: 'LEGACY', legacy_path: provenance, legacy_revision: revision,
      display_order: position, width: photo.width, height: photo.height, status: 'DRAFT',
    }, { onConflict: 'legacy_path', ignoreDuplicates: true }).select('id')
    if (error) throw error
    if (data.length) summary.imported++
    else summary.skipped++
  }
  return summary
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the target project')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  console.log(await importGallery(db))
}
