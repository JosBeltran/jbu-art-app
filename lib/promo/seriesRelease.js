// Series Release Studio: textos y reglas de las piezas de lanzamiento de una Serie.
// Solo presentación: no lee ni cambia ventas, visibilidad, subastas ni pedidos.
import { getLocalizedSeriesContent } from '../seriesContent.js'

export const SITE = 'https://www.josuebeltranuresti.com'
export const SITE_LABEL = 'josuebeltranuresti.com'

export const PROMO_TYPES = ['SERIES_DROP', 'LAUNCHING_SOON', 'NOW_LIVE', 'RELEASE_PREVIEW', 'FEATURED_SERIES', 'COLLECTION_HIGHLIGHT']
export const MODES = ['hero', 'grid', 'typo']
export const CTAS = ['EXPLORE_SERIES', 'VIEW_WORKS', 'DISCOVER_RELEASE', 'SEE_DROP', 'ENTER_SERIES', 'AVAILABLE_NOW']

const TYPE_COPY = {
  SERIES_DROP: { es: ['NUEVA SERIE', 'Un nuevo cuerpo de obra de Josué Beltrán Uresti', 'Ya disponible en JBU'], en: ['NEW SERIES', 'A new body of work by Josué Beltrán Uresti', 'Now live at JBU'] },
  LAUNCHING_SOON: { es: ['PRÓXIMO LANZAMIENTO', 'Lanzamiento de la serie', 'Mira las obras antes'], en: ['LAUNCHING SOON', 'Series release', 'Preview the works'] },
  NOW_LIVE: { es: ['YA DISPONIBLE', 'Explora el lanzamiento', 'Obras disponibles en línea'], en: ['NOW LIVE', 'Explore the release', 'Available works now online'] },
  RELEASE_PREVIEW: { es: ['PREVIEW DEL LANZAMIENTO', 'Obras seleccionadas del próximo lanzamiento', ''], en: ['RELEASE PREVIEW', 'Selected works from the upcoming release', ''] },
  FEATURED_SERIES: { es: ['SERIE DESTACADA', 'Selección del estudio', ''], en: ['FEATURED SERIES', 'Studio selection', ''] },
  COLLECTION_HIGHLIGHT: { es: ['COLECCIÓN', 'Una mirada al cuerpo de obra', ''], en: ['COLLECTION HIGHLIGHT', 'A look at the body of work', ''] },
}

const CTA_COPY = {
  EXPLORE_SERIES: ['EXPLORA LA SERIE', 'EXPLORE SERIES'],
  VIEW_WORKS: ['VER OBRAS', 'VIEW WORKS'],
  DISCOVER_RELEASE: ['DESCUBRE EL LANZAMIENTO', 'DISCOVER THE RELEASE'],
  SEE_DROP: ['VER EL DROP', 'SEE THE DROP'],
  ENTER_SERIES: ['ENTRA A LA SERIE', 'ENTER THE SERIES'],
  AVAILABLE_NOW: ['DISPONIBLE AHORA', 'AVAILABLE NOW'],
}

const L = (lang) => (lang === 'en' ? 'en' : 'es')

export function typeLabel(type, lang) { return (TYPE_COPY[type] || TYPE_COPY.SERIES_DROP)[L(lang)][0] }
export function ctaLabel(cta, lang) { return (CTA_COPY[cta] || CTA_COPY.EXPLORE_SERIES)[L(lang) === 'en' ? 1 : 0] }

/** Tipo sugerido según el estado editorial real de la Serie. */
export function suggestType(series) {
  return series?.editorial_status === 'coming_soon' ? 'LAUNCHING_SOON' : 'SERIES_DROP'
}

/** Composición sugerida: tipográfica para próximos lanzamientos, retícula con 3+ obras, si no obra principal. */
export function suggestMode(type, workCount) {
  if (type === 'LAUNCHING_SOON') return 'typo'
  return workCount >= 3 ? 'grid' : 'hero'
}

export function suggestCta(type) {
  if (type === 'LAUNCHING_SOON' || type === 'RELEASE_PREVIEW') return 'DISCOVER_RELEASE'
  if (type === 'NOW_LIVE') return 'VIEW_WORKS'
  return 'EXPLORE_SERIES'
}

/** Destino público existente de la Serie (el mismo del botón "Ver serie"). */
export function seriesPublicUrl(series) {
  const path = series?.cta_url || `/catalog?series=${encodeURIComponent(series?.title || '')}`
  return /^https?:\/\//.test(path) ? path : `${SITE}${path.startsWith('/') ? '' : '/'}${path}`
}

export function fmtRelease(iso, lang) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(L(lang) === 'en' ? 'en-US' : 'es-MX', { month: 'long', day: 'numeric' })
}

export function worksLine(count, lang) {
  if (!count) return ''
  if (L(lang) === 'en') return count === 1 ? '1 work' : `${count} works`
  return count === 1 ? '1 obra' : `${count} obras`
}

/** Orden de obras: principal primero, luego destacadas, luego el resto. Solo obras reales de la Serie. */
export function orderWorks(works, mainId) {
  const list = (works || []).filter((w) => w && w.primary_image_url)
  const rank = (w) => (mainId && String(w.id) === String(mainId) ? 0 : w.featured ? 1 : 2)
  return [...list].sort((a, b) => rank(a) - rank(b))
}

/** Todo el texto que necesita una pieza, ya en el idioma elegido (inglés vacío → español). */
export function buildReleaseCopy({ series, type, cta, lang, workCount }) {
  const c = getLocalizedSeriesContent(series, L(lang))
  const [label, line, note] = (TYPE_COPY[type] || TYPE_COPY.SERIES_DROP)[L(lang)]
  const date = fmtRelease(series?.launch_date, lang)
  const dateLine = date ? (L(lang) === 'en' ? `Release opening ${date}` : `Lanzamiento el ${date}`) : ''
  return {
    label,
    name: c.name || series?.title || '',
    subtitle: c.subtitle,
    short: c.shortDescription,
    line: type === 'LAUNCHING_SOON' && dateLine ? dateLine : line,
    note,
    date: dateLine,
    works: worksLine(workCount, lang),
    cta: ctaLabel(cta, lang),
    site: SITE_LABEL,
  }
}

const CAPTION = {
  SERIES_DROP: { es: (n) => `Una nueva serie ya está disponible.\n\n${n} presenta un nuevo cuerpo de obra de Josué Beltrán Uresti, ahora en JBU.`, en: (n) => `A new series is now live.\n\n${n} presents a new body of work by Josué Beltrán Uresti, now available through JBU.` },
  LAUNCHING_SOON: { es: (n) => `Próximo lanzamiento.\n\n${n} llegará muy pronto a JBU.`, en: (n) => `Launching soon.\n\n${n} will be released shortly through JBU.` },
  NOW_LIVE: { es: (n) => `Ya disponible.\n\n${n} está en línea. Explora las obras.`, en: (n) => `Now live.\n\n${n} is online. Explore the works.` },
  RELEASE_PREVIEW: { es: (n) => `Preview del lanzamiento.\n\nObras seleccionadas de ${n}.`, en: (n) => `Release preview.\n\nSelected works from ${n}.` },
  FEATURED_SERIES: { es: (n) => `Serie destacada del estudio: ${n}.`, en: (n) => `Featured studio series: ${n}.` },
  COLLECTION_HIGHLIGHT: { es: (n) => `${n}. Una mirada al cuerpo de obra.`, en: (n) => `${n}. A look at the body of work.` },
}

export function buildReleaseCaption({ series, type, lang, url }) {
  const name = getLocalizedSeriesContent(series, L(lang)).name || series?.title || ''
  const body = (CAPTION[type] || CAPTION.SERIES_DROP)[L(lang)](name)
  const tail = type === 'LAUNCHING_SOON'
    ? (L(lang) === 'en' ? 'Preview the works and follow the release:' : 'Mira las obras y sigue el lanzamiento:')
    : (L(lang) === 'en' ? 'Explore the release:' : 'Explora el lanzamiento:')
  return `${body}\n\n${tail}\n${url}\n\n#JBU #ContemporaryArt #JosueBeltranUresti`
}
