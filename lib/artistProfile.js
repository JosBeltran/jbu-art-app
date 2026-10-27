/**
 * Perfil editorial de artista (página About) — funciones puras compartidas.
 *
 * La identidad del artista vive en public.profiles; artist_profiles solo guarda
 * el contenido editorial público. site_settings.primary_artist_profile_id marca
 * el artista principal del sitio. Nada aquí asume un solo artista: las funciones
 * reciben filas y devuelven datos, sin rutas ni contenido fijo.
 */

/** Artista principal visible: el configurado y con About activado; si no, null. */
export function resolvePrimaryArtist({ settings, artists } = {}) {
  const id = settings?.primary_artist_profile_id
  if (!id) return null
  return (artists || []).find((a) => a && a.profile_id === id && a.about_enabled === true) || null
}

/**
 * Campo localizado del perfil (p. ej. artistField(artist, 'biography', 'en')).
 * Respaldo al español si la traducción inglesa está vacía (misma regla que Series).
 */
export function artistField(artist, field, lang) {
  if (!artist) return ''
  if (lang === 'en') {
    const en = artist[`${field}_en`]
    if (en != null && String(en).trim() !== '') return String(en)
  }
  const es = artist[`${field}_es`]
  return es != null ? String(es) : ''
}

/**
 * Divide la biografía en párrafos: los párrafos se separan con líneas en blanco
 * en Admin y se renderizan como párrafos independientes. Saltos simples dentro
 * de un párrafo se unen con espacio.
 */
export function splitParagraphs(text) {
  return String(text ?? '')
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

/** URL http(s) válida; vacío es válido (campo opcional). */
export function isValidHttpUrl(value) {
  const v = String(value ?? '').trim()
  if (!v) return true
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Correo con formato básico válido; vacío es válido (campo opcional). */
export function isValidEmail(value) {
  const v = String(value ?? '').trim()
  if (!v) return true
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
}

/**
 * Valida el borrador del Admin antes de guardar.
 * @returns {{ ok: boolean, errors: Record<string, string> }}
 */
export function validateArtistProfile(draft) {
  const errors = {}
  if (!String(draft?.display_name ?? '').trim()) errors.display_name = 'required'
  if (!isValidEmail(draft?.contact_email)) errors.contact_email = 'invalid_email'
  if (!isValidHttpUrl(draft?.website_url)) errors.website_url = 'invalid_url'
  if (!isValidHttpUrl(draft?.instagram_url)) errors.instagram_url = 'invalid_url'
  return { ok: Object.keys(errors).length === 0, errors }
}

/** Ciudad (primer segmento de la ubicación) para textos breves. */
function artistCity(artist, lang) {
  const location = artistField(artist, 'location', lang)
  return location.split(',')[0].trim()
}

/** Título SEO generado desde el perfil (sirve para cualquier artista). */
export function aboutMetaTitle(artist, lang = 'es') {
  const name = String(artist?.display_name ?? '').trim()
  if (!name) return ''
  const city = artistCity(artist, lang)
  if (!city) return name
  return lang === 'en'
    ? `${name} | Contemporary Artist in ${city}`
    : `${name} | Artista contemporáneo en ${city}`
}

/** Descripción SEO: primer párrafo de la biografía, recortado sin relleno. */
export function aboutMetaDescription(artist, lang = 'es') {
  const first = splitParagraphs(artistField(artist, 'biography', lang))[0] || ''
  return first.length > 160 ? `${first.slice(0, 157).trimEnd()}…` : first
}
