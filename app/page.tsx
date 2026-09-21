import { getArtworks } from '@/lib/artworks'
import LandingClient from './landing/LandingClient'

type HomepageArtwork = {
  id: string
  primary_image_url?: string | null
  featured?: boolean | null
  [key: string]: unknown
}

export const revalidate = 0

export const metadata = {
  title: 'JBU — Josué Beltrán Uresti | Galería',
  description:
    'Galería de obra original de Josué Beltrán Uresti. Pintura contemporánea desde Monterrey, N.L.',
}

export default async function HomePage() {
  const artworks = ((await getArtworks()) || []) as HomepageArtwork[]

  const withImage = artworks.filter((artwork) => Boolean(artwork.primary_image_url))
  // La imagen principal es la primera obra marcada como destacada
  const hero =
    withImage.find((artwork) => artwork.featured) || withImage[0] || null
  // El carrusel muestra primero el resto de destacadas y luego las más recientes
  const selected = withImage
    .filter((artwork) => artwork.id !== hero?.id)
    .sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false))
    .slice(0, 8)

  return <LandingClient hero={hero} artworks={selected} />
}
