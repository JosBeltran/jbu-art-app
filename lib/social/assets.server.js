import 'server-only'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import sharp from 'sharp'
import { SITE_URL } from '../seo.js'

const MAX_BYTES = 12 * 1024 * 1024
export function allowedAssetUrl(value, storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const url = new URL(value, SITE_URL)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    const site = new URL(SITE_URL)
    if (url.origin === site.origin && /^\/(jbu-logo\.png|images\/|assets-optimized\/|social\/)/.test(url.pathname)) return url
    if (storageUrl && url.origin === new URL(storageUrl).origin && url.pathname.startsWith('/storage/v1/object/public/')) return url
  } catch { /* invalid or untrusted asset */ }
  return null
}
export async function assetBytes(value) {
  const url = allowedAssetUrl(value)
  if (!url) return null
  try {
    if (url.origin === new URL(SITE_URL).origin) {
      const root = resolve(process.cwd(), 'public')
      const file = resolve(root, `.${decodeURIComponent(url.pathname)}`)
      if (!file.startsWith(root + sep)) return null
      const bytes = await readFile(file)
      return bytes.length <= MAX_BYTES ? bytes : null
    }
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) })
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null
    if (Number(response.headers.get('content-length')) > MAX_BYTES) return null
    const reader = response.body?.getReader()
    if (!reader) return null
    const chunks = []; let size = 0
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      size += chunk.byteLength
      if (size > MAX_BYTES) { await reader.cancel(); return null }
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  } catch { return null }
}
export async function preparedAsset(value, width, height) {
  const bytes = await assetBytes(value)
  if (!bytes) return null
  try {
    const image = await sharp(bytes, { limitInputPixels: 60000000 }).rotate().resize({ width, height, fit: 'inside', withoutEnlargement: false }).png().toBuffer({ resolveWithObject: true })
    return { src: `data:image/png;base64,${image.data.toString('base64')}`, width: image.info.width, height: image.info.height }
  } catch { return null }
}
