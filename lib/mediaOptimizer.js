'use client'
// Optimización desde el navegador del administrador.
// - Fotos: las procesa el servidor (/api/admin/media/optimize-image).
// - Videos: se convierten aquí mismo con ffmpeg (WebAssembly) y se suben ya listos.
// Los originales nunca se modifican.
import { supabase } from '@/lib/supabaseClient'
import { authHeaders } from '@/lib/authHeaders'
import { BUCKET, parseStorageUrl, urlExists, variantFolder, videoVariants } from '@/lib/mediaVariants'

export async function optimizeImage(url, { dryRun = false, force = false } = {}) {
  const res = await fetch('/api/admin/media/optimize-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ url, dryRun, force }),
  })
  if (!res.ok) return { status: 'failed', url, error: `HTTP ${res.status}` }
  return res.json()
}

/** Optimiza en segundo plano sin bloquear al admin; los errores se ignoran (queda el original). */
export function optimizeImageInBackground(url) {
  if (!parseStorageUrl(url)) return
  optimizeImage(url).catch(() => {})
}

export async function videoStatus(url) {
  const v = videoVariants(url)
  if (!v) return 'unsupported'
  const [web, poster] = await Promise.all([urlExists(v.web), urlExists(v.poster)])
  return web && poster ? 'skipped' : 'pending'
}

let ffmpegPromise = null
async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')])
      const ffmpeg = new FFmpeg()
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })().catch((err) => { ffmpegPromise = null; throw err })
  }
  return ffmpegPromise
}

/** Primer cuadro útil del video → WebP ligero (máx. 1600 px). */
async function makePoster(blob) {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = objectUrl
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve
      video.onerror = () => reject(new Error('poster: no se pudo leer el video'))
    })
    video.currentTime = Math.min(0.5, (video.duration || 1) / 4)
    await new Promise((resolve) => { video.onseeked = resolve; setTimeout(resolve, 3000) })
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('poster vacío'))), 'image/webp', 0.82))
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Crea web-1080.mp4 (H.264 + AAC, inicio rápido, lado mayor ≤ 1920 px) y poster.webp.
 * @param {string} url URL pública del original
 * @param {{ file?: File|Blob, force?: boolean, onProgress?: (p: number, label: string) => void }} [opts]
 */
export async function optimizeVideo(url, { file, force = false, onProgress = () => {} } = {}) {
  const info = parseStorageUrl(url)
  if (!info) return { status: 'unsupported', url }
  if (!force && (await videoStatus(url)) === 'skipped') return { status: 'skipped', url }

  onProgress(0, 'load')
  const ffmpeg = await getFFmpeg()
  const source = file || (await fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(`original ${r.status}`); return r.blob() }))
  const originalBytes = source.size
  const ext = (info.path.split('.').pop() || 'mp4').toLowerCase()
  const inName = `in.${ext}`
  const onFfProgress = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress || 0)), 'encode')
  ffmpeg.on('progress', onFfProgress)
  try {
    await ffmpeg.writeFile(inName, new Uint8Array(await source.arrayBuffer()))
    const args = [
      '-i', inName,
      '-vf', "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      'out.mp4',
    ]
    const code = await ffmpeg.exec(args)
    if (code !== 0) throw new Error(`ffmpeg ${code}`)
    const data = await ffmpeg.readFile('out.mp4')
    const web = new Blob([data], { type: 'video/mp4' })
    onProgress(1, 'poster')
    const poster = await makePoster(web)

    onProgress(1, 'upload')
    const folder = variantFolder(info.path)
    const up = async (name, blob, type) => {
      const { error } = await supabase.storage.from(BUCKET).upload(`${folder}/${name}`, blob, { contentType: type, cacheControl: '31536000', upsert: true })
      if (error) throw new Error(`${name}: ${error.message}`)
    }
    await up('web-1080.mp4', web, 'video/mp4')
    await up('poster.webp', poster, 'image/webp')
    return { status: 'optimized', url, originalBytes, optimizedBytes: web.size + poster.size }
  } finally {
    ffmpeg.off('progress', onFfProgress)
    try { await ffmpeg.deleteFile(inName) } catch {}
    try { await ffmpeg.deleteFile('out.mp4') } catch {}
  }
}
