import { getArtworks } from '@/lib/artworks'
import LandingClient from './landing/LandingClient'
import { supabase } from '@/lib/supabaseClient'
import { buildHomeSections, isHomeEligible } from '@/lib/homeSeries'
import { buildHeroSlides } from '@/lib/heroSlides'
import { PERSON_SCHEMA } from '@/lib/seo'

type HomepageArtwork = {
  id: string
  primary_image_url?: string | null
  featured?: boolean | null
  [key: string]: unknown
}

export const revalidate = 0

const SITE_URL = 'https://www.josuebeltranuresti.com/'
const TITLE = 'Josué Beltrán Uresti | Contemporary Artist & Creative in Monterrey'
const DESCRIPTION =
  'Official website of Josué Beltrán Uresti, contemporary artist and creative based in Monterrey, Mexico. Explore original paintings, mixed-media works, resin art, drawings, art objects and available contemporary artwork.'
const SHARE_DESCRIPTION =
  'Original paintings, mixed media, resin art and art objects by Mexican contemporary artist and creative Josué Beltrán Uresti, based in Monterrey.'
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
  PERSON_SCHEMA,
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Josué Beltrán Uresti',
    alternateName: 'JBU',
    url: SITE_URL,
    inLanguage: ['es-MX', 'en-US'],
    publisher: { '@id': PERSON_SCHEMA['@id'] },
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

  // Hero configurable (migración 20261103): si las tablas aún no existen,
  // se conserva el comportamiento actual (obra destacada).
  let heroSettings: any = null
  let heroSlideRows: any[] = []
  let siteSettings: any = null
  try {
    const [settingsRes, slidesRes, siteRes] = await Promise.all([
      supabase.from('hero_settings').select('mode').eq('id', true).maybeSingle(),
      supabase.from('hero_slides').select('*').eq('enabled', true).order('position', { ascending: true }),
      supabase.from('site_settings').select('inquiry_channel, whatsapp_number').eq('id', true).maybeSingle(),
    ])
    if (!settingsRes.error) heroSettings = settingsRes.data
    if (!slidesRes.error && slidesRes.data) heroSlideRows = slidesRes.data
    if (!siteRes.error) siteSettings = siteRes.data
  } catch {
    heroSettings = null
    heroSlideRows = []
    siteSettings = null
  }

  const heroSlides = buildHeroSlides({
    settings: heroSettings,
    slides: heroSlideRows,
    featured: withImage.slice(0, 8),
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <LandingClient heroSlides={heroSlides.slides} artworks={selected} sections={sections} siteSettings={siteSettings} />
    </>
  )
}
