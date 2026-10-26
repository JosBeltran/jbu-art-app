// Utilidades SEO compartidas. Sin efectos: solo arma textos, URLs y JSON-LD.
export const SITE_URL = 'https://www.josuebeltranuresti.com'
export const ARTIST_NAME = 'Josué Beltrán Uresti'
export const SHARE_IMAGE = `${SITE_URL}/opengraph-image.jpg`

export const absoluteUrl = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

export const PERSON_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': `${SITE_URL}/#artist`,
  name: ARTIST_NAME,
  alternateName: 'JBU',
  url: `${SITE_URL}/`,
  image: SHARE_IMAGE,
  jobTitle: 'Contemporary Artist and Creative',
  description:
    'Contemporary Mexican artist and creative based in Monterrey, Mexico, working across painting, mixed media, resin, drawing and collectible art objects.',
  knowsAbout: ['Contemporary art', 'Abstract art', 'Painting', 'Mixed media', 'Resin art', 'Drawing', 'Art objects'],
  address: { '@type': 'PostalAddress', addressLocality: 'Monterrey', addressRegion: 'Nuevo León', addressCountry: 'MX' },
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Una obra es indexable solo si es pública (mismo criterio que el catálogo). */
export function isIndexableArtwork(artwork, seriesVisible = true) {
  return Boolean(artwork) && ['AVAILABLE', 'OWNED'].includes(String(artwork.status || '').toUpperCase()) && seriesVisible
}

export function artworkTitle(artwork) {
  return `${clean(artwork.title)} | ${ARTIST_NAME}`
}

export function artworkDescription(artwork) {
  const title = clean(artwork.title)
  const series = clean(artwork.series)
  const details = [clean(artwork.medium), clean(artwork.year), clean(artwork.dimensions)].filter(Boolean).join(', ')
  let text = `${title}, an original contemporary artwork by Mexican artist and creative ${ARTIST_NAME}`
  if (series) text += `, from the ${series} series`
  text += '.'
  if (details) text += ` ${details}.`
  return text.length > 300 ? `${text.slice(0, 297)}…` : text
}

export function artworkJsonLd(artwork) {
  const url = absoluteUrl(`/artwork/${encodeURIComponent(artwork.sku)}`)
  const art = {
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: clean(artwork.title),
    url,
    description: artworkDescription(artwork),
    creator: { '@id': PERSON_SCHEMA['@id'], '@type': 'Person', name: ARTIST_NAME },
    artform: 'Painting',
  }
  if (artwork.primary_image_url) art.image = artwork.primary_image_url
  if (artwork.medium) art.artMedium = clean(artwork.medium)
  if (artwork.year) art.dateCreated = clean(artwork.year)
  if (artwork.series) art.isPartOf = { '@type': 'CreativeWorkSeries', name: clean(artwork.series) }
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Catalog', item: absoluteUrl('/catalog') },
      { '@type': 'ListItem', position: 3, name: clean(artwork.title), item: url },
    ],
  }
  return [art, crumbs]
}

/** Rutas privadas que nunca deben rastrearse ni aparecer en el sitemap. */
export const PRIVATE_PATHS = ['/admin', '/api', '/auth', '/login', '/signup', '/reset-password', '/consent', '/cart', '/checkout', '/orders', '/claim', '/collection', '/profile', '/offers', '/notifications', '/auctions$', '/verify', '/landing']
