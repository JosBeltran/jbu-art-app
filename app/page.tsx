import { getArtworks } from '@/lib/artworks'
import LandingClient from './landing/LandingClient'
import { supabase } from '@/lib/supabaseClient'
import { buildHomeSections, isHomeEligible } from '@/lib/homeSeries'

type HomepageArtwork = {
  id: string
  primary_image_url?: string | null
  featured?: boolean | null
  [key: string]: unknown
}

export const revalidate = 0

const SITE_URL = 'https://www.josuebeltranuresti.com/'
const TITLE = 'Josué Beltrán Uresti | Contemporary Artist in Monterrey, Mexico'
const DESCRIPTION =
  'Official website of Josué Beltrán Uresti, a contemporary artist based in Monterrey, Mexico. Explore original abstract paintings, mixed-media works, resin art and available artwork.'
const SHARE_DESCRIPTION =
  'Explore original abstract paintings, mixed-media works and resin art by contemporary Mexican artist Josué Beltrán Uresti.'
const SHARE_IMAGE = 'https://www.josuebeltranuresti.com/opengraph-image.jpg'

export const metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Josué Beltrán Uresti',
    title: TITLE,
    description: SHARE_DESCRIPTION,
    images: [{ url: SHARE_IMAGE, width: 1200, height: 630, alt: 'Josué Beltrán Uresti — JBU' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: SHARE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
}

const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Josué Beltrán Uresti',
    url: SITE_URL,
    jobTitle: 'Contemporary Artist',
    description:
      'Contemporary Mexican artist based in Monterrey, Mexico, working with abstract art, mixed media, pigments, resin and works on paper.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Monterrey',
      addressRegion: 'Nuevo León',
      addressCountry: 'MX',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Josué Beltrán Uresti',
    alternateName: 'JBU',
    url: SITE_URL,
  },
]

export default async function HomePage() {
  const artworks = ((await getArtworks()) || []) as HomepageArtwork[]

  // Series primero: su estado decide si sus obras pueden aparecer en la portada
  let seriesRows: any[] | null = null
  try {
    const { data, error } = await supabase.from('series').select('*')
    if (!error && data) seriesRows = data
  } catch {
    seriesRows = null
  }

  const withImage = artworks.filter(
    (artwork) => Boolean(artwork.primary_image_url) && isHomeEligible(artwork, seriesRows || [])
  )
  // La imagen principal es la primera obra destacada cuya Serie está publicada
  const hero =
    withImage.find((artwork) => artwork.featured) || withImage[0] || null
  // El carrusel muestra primero el resto de destacadas y luego las más recientes
  const selected = withImage
    .filter((artwork) => artwork.id !== hero?.id)
    .sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false))
    .slice(0, 8)

  // Secciones editoriales por Serie (si la migración aún no existe, se usa la portada anterior)
  let sections: unknown[] = []
  try {
    if (seriesRows) {
      const homeRows = seriesRows.filter((s: any) => s.home_featured === true || s.editorial_status === 'outlet')
      sections = buildHomeSections(homeRows, withImage, { heroId: hero?.id })
    }
  } catch {
    sections = []
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <LandingClient hero={hero} artworks={selected} sections={sections} />
    </>
  )
}
