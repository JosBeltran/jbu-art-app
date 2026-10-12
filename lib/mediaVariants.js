// Versiones optimizadas de los medios de cada obra.
// El original nunca se toca: las versiones viven en el mismo bucket, bajo
//   artworks/optimized/<ruta-original-sin-extensión>/{thumbnail,medium,large}.webp
//   artworks/optimized/<ruta-original-sin-extensión>/{web-1080.mp4,poster.webp}
// La ruta se deriva de la URL original, así que no hace falta cambiar la base de datos.
// Si una versión todavía no existe, los componentes regresan al original.

export const BUCKET = 'artworks'
export const OPTIMIZED_PREFIX = 'optimized/'

export const IMAGE_VARIANTS = [
  { name: 'thumbnail', width: 800, quality: 78 },
  { name: 'medium', width: 1600, quality: 82 },
  { name: 'large', width: 2600, quality: 85 },
]

const PUBLIC_RE = /^(https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/)([^/]+)\/([^?#]+)/

/** Devuelve { base, bucket, path } si la URL es un archivo público del bucket de obras. */
export function parseStorageUrl(url) {
  const m = PUBLIC_RE.exec(url || '')
  if (!m || m[2] !== BUCKET) return null
  const path = decodeURIComponent(m[3])
  if (path.startsWith(OPTIMIZED_PREFIX)) return null
  return { base: m[1], bucket: m[2], path }
}

/** Carpeta (dentro del bucket) donde viven las versiones de un original. */
export function variantFolder(path) {
  return OPTIMIZED_PREFIX + path.replace(/\.[^./]+$/, '')
}

function publicUrl(info, file) {
  const p = `${variantFolder(info.path)}/${file}`.split('/').map(encodeURIComponent).join('/')
  return `${info.base}${info.bucket}/${p}`
}

/** URLs de las versiones de una imagen, o null si la URL no admite versiones. */
export function imageVariants(url) {
  const info = parseStorageUrl(url)
  if (!info) return null
  const v = { original: url }
  IMAGE_VARIANTS.forEach(({ name }) => { v[name] = publicUrl(info, `${name}.webp`) })
  v.srcSet = IMAGE_VARIANTS.map(({ name, width }) => `${v[name]} ${width}w`).join(', ')
  return v
}

/** URLs de la versión web y del póster de un video, o null. */
export function videoVariants(url) {
  const info = parseStorageUrl(url)
  if (!info) return null
  return { original: url, web: publicUrl(info, 'web-1080.mp4'), poster: publicUrl(info, 'poster.webp') }
}

/** Tamaños de presentación (atributo sizes) por contexto. */
export const SIZES = {
  card: '(max-width: 640px) 50vw, (max-width: 1056px) 33vw, (max-width: 1584px) 25vw, 400px',
  carousel: '(max-width: 640px) 80vw, 360px',
  hero: '100vw',
  detail: '(max-width: 900px) 100vw, (max-width: 1584px) 60vw, 1000px',
  thumb: '96px',
  lightbox: '100vw',
}

/** ¿Existe ya un archivo público? (HEAD barato contra el almacenamiento). */
export async function urlExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}
