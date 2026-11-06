// Server-safe, pure Open Graph helpers. Do not disclose admin-only settings.
import { SITE_URL, SHARE_IMAGE } from '../seo.js'
import { getLocalizedSeriesContent } from '../seriesContent.js'

export const PROMOTIONAL_DEFAULTS = {
  prints: {
    title_en: 'JBU Fine Art Prints',
    title_es: 'JBU — Impresiones artísticas',
    description_en: 'Discover contemporary art reproductions on fine art paper. Open Editions with shipping included to the USA and Canada.',
    description_es: 'Descubre reproducciones de arte contemporáneo en papel artístico. Ediciones abiertas con envío incluido a Estados Unidos y Canadá.',
  },
  catalog: {
    title_en: 'Original Contemporary Art | Josué Beltrán Uresti',
    title_es: 'Arte contemporáneo original | Josué Beltrán Uresti',
    description_en: 'Explore contemporary artworks, paintings and mixed-media art from Estudio JBU.',
    description_es: 'Explora obras originales, pinturas y arte de técnica mixta de Estudio JBU.',
  },
}

const clean = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : ''
export const PROMO_FIELDS = ['title_es','title_en','description_es','description_en','image_url','image_alt','default_language']
export function normalizePromoSettings(raw) {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    title_es: clean(v.title_es, 180),
    title_en: clean(v.title_en, 180),
    description_es: clean(v.description_es, 400),
    description_en: clean(v.description_en, 400),
    image_url: clean(v.image_url, 2048),
    image_alt: clean(v.image_alt, 240),
    image_width: Number.isInteger(v.image_width) && v.image_width > 0 ? v.image_width : null,
    image_height: Number.isInteger(v.image_height) && v.image_height > 0 ? v.image_height : null,
    default_language: v.default_language === 'en' ? 'en' : 'es',
  }
}
export function seriesSlug(series) {
  if (typeof series?.slug === 'string' && series.slug.trim()) return series.slug.trim().toLowerCase()
  return String(series?.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
export function findSeriesBySlug(rows, slug) {
  const needle = slugifySeriesLabel(slug)
  if (!needle) return null
  return (rows || []).find(s =>
    [seriesSlug(s), slugifySeriesLabel(s.title), slugifySeriesLabel(s.name_es), slugifySeriesLabel(s.name_en)]
      .some(candidate => candidate === needle)
  ) || null
}

function slugifySeriesLabel(label) {
  return String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
export function publicImageUrl(candidate) {
  try {
    if (!candidate) return ''
    const url = new URL(candidate, SITE_URL)
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    // Avoid signed, temporary and private links.
    if (/token|signature|expires|x-amz-signature/i.test(url.search)) return ''
    return url.href
  } catch { return '' }
}
function imageWithRevision(image, revision) {
  const src = publicImageUrl(image)
  if (!src || !revision || src === SHARE_IMAGE) return src
  const url = new URL(src)
  url.searchParams.set('v', String(revision).replace(/[^\w-]/g, '').slice(0, 40))
  return url.href
}
export function promotionalMetadata({ kind, path, settings, series, mainImage, revision, language } = {}) {
  const entry = normalizePromoSettings(settings)
  const lang = language === 'en' || language === 'es' ? language : entry.default_language
  const defaults = PROMOTIONAL_DEFAULTS[kind] || PROMOTIONAL_DEFAULTS.catalog
  const content = series ? getLocalizedSeriesContent(series, lang) : null
  const other = lang === 'en' ? 'es' : 'en'
  const title = entry['title_' + lang] || entry['title_' + other] ||
    content?.name || defaults['title_' + lang]
  const description = entry['description_' + lang] || entry['description_' + other] ||
    content?.shortDescription || content?.description || defaults['description_' + lang]
  const image = imageWithRevision(entry.image_url || mainImage || SHARE_IMAGE, revision) || SHARE_IMAGE
  const url = new URL(path || '/catalog', SITE_URL).href
  const alt = entry.image_alt || title
  const dimensions = entry.image_url && entry.image_width && entry.image_height
    ? { width: entry.image_width, height: entry.image_height }
    : image === SHARE_IMAGE ? { width: 1200, height: 630 } : {}
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website', url, siteName: 'Josué Beltrán Uresti',
      title, description, locale: lang === 'en' ? 'en_US' : 'es_MX',
      alternateLocale: [lang === 'en' ? 'es_MX' : 'en_US'],
      images: [{ url: image, secureUrl: image, ...dimensions, alt }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: image, alt }] },
  }
}
