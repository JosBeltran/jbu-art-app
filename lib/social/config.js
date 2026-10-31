import { SITE_URL, ARTIST_NAME } from '../seo.js'

export const SOCIAL_FORMATS = {
  horizontal: { width: 1200, height: 630 },
  pinterest: { width: 1000, height: 1500 },
  instagram: { width: 1080, height: 1350 },
}
const flags = { enabled: true, branding: true, logo: true, title: true, artist: true, domain: false }
export const SOCIAL_DEFAULTS = {
  logoUrl: `${SITE_URL}/jbu-logo.png`, displayName: '', showDomain: true, theme: 'light',
  horizontal: { ...flags, domain: true }, pinterest: { ...flags }, instagram: { ...flags },
}
// A single global resolver; an eventual override layer belongs here, not in callers.
export function socialConfig(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const result = {
    logoUrl: typeof source.logoUrl === 'string' ? source.logoUrl.trim().slice(0, 2048) : SOCIAL_DEFAULTS.logoUrl,
    displayName: typeof source.displayName === 'string' ? source.displayName.trim().slice(0, 120) : '',
    showDomain: typeof source.showDomain === 'boolean' ? source.showDomain : true,
    theme: source.theme === 'dark' ? 'dark' : 'light',
  }
  for (const format of Object.keys(SOCIAL_FORMATS)) {
    result[format] = { ...SOCIAL_DEFAULTS[format] }
    for (const key of Object.keys(flags)) if (typeof source[format]?.[key] === 'boolean') result[format][key] = source[format][key]
  }
  return result
}
export function socialFormat(format, config) {
  const valid = Object.hasOwn(SOCIAL_FORMATS, format) ? format : 'horizontal'
  return valid !== 'horizontal' && config[valid].enabled === false ? 'horizontal' : valid
}
export function socialImageUrl(sku, format = 'horizontal', locale = 'es', version = '') {
  const lang = String(locale).startsWith('en') ? 'en' : 'es'
  const query = new URLSearchParams({ lang })
  if (version) query.set('v', version)
  return `${SITE_URL}/social/artwork/${encodeURIComponent(String(sku || '').trim())}/${format}?${query}`
}
export function socialPresentation(artwork = {}, config = socialConfig(), artistName = '', locale = 'es') {
  const en = String(locale).startsWith('en')
  const title = String((en && artwork.title_en) || artwork.title || artwork.sku || (en ? 'Artwork' : 'Obra')).trim().slice(0, 180)
  const artist = config.displayName || artistName || ARTIST_NAME
  const details = [(en && artwork.medium_en) || artwork.medium, artwork.year, artwork.dimensions].filter(Boolean).join(' · ')
  const description = [title, artist, details].filter(Boolean).join(' — ').slice(0, 300)
  return { title, artist, description, domain: new URL(SITE_URL).hostname.replace(/^www\./, '') }
}
// Fit without cropping or stretching; tested for portrait/landscape/square/panorama.
export function containSize(width, height, boxWidth, boxHeight) {
  if (!(width > 0 && height > 0)) return { width: boxWidth, height: boxHeight }
  const scale = Math.min(boxWidth / width, boxHeight / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
