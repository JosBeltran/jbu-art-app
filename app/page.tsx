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
  const hero =
    withImage.find((a: any) => a?.featured) || withImage[0] || null
  const selected = withImage.filter((a: any) => a?.id !== hero?.id).slice(0, 8)

  return <LandingClient hero={hero} artworks={selected} />
}
