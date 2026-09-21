import { getArtworks } from '@/lib/artworks'
import LandingClient from './landing/LandingClient'

export const revalidate = 0

export const metadata = {
  title: 'JBU — Josué Beltrán Uresti | Galería',
  description:
    'Galería de obra original de Josué Beltrán Uresti. Pintura contemporánea desde Monterrey, N.L.',
}

export default async function HomePage() {
  const artworks = (await getArtworks()) || []

  const withImage = artworks.filter((a: any) => a?.primary_image_url)
  // La imagen principal es la primera obra marcada como destacada
  const hero =
    withImage.find((a: any) => a?.featured) || withImage[0] || null
  // El carrusel muestra primero el resto de destacadas y luego las más recientes
  const selected = withImage
    .filter((a: any) => a?.id !== hero?.id)
    .sort((a: any, b: any) => Number(b?.featured ?? false) - Number(a?.featured ?? false))
    .slice(0, 8)

  return <LandingClient hero={hero} artworks={selected} />
}
