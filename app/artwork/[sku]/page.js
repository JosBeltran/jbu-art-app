import { getArtworkBySku } from '@/lib/artworks'
import ArtworkDetailClient from './ArtworkDetailClient'
import { notFound } from 'next/navigation'

export const revalidate = 0

export async function generateMetadata({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)
  if (!artwork) return { title: 'Obra no encontrada' }

  const description = artwork.description
    ? String(artwork.description).slice(0, 160)
    : `${artwork.title} — obra original de Josué Beltrán Uresti con certificado digital de autenticidad.`

  return {
    title: `${artwork.title} | Estudio JBU`,
    description,
    openGraph: {
      title: `${artwork.title} | Estudio JBU`,
      description,
      type: 'article',
      images: artwork.primary_image_url ? [artwork.primary_image_url] : undefined
    }
  }
}

export default async function ArtworkPage({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)

  if (!artwork) {
    notFound()
  }

  return <ArtworkDetailClient artwork={artwork} />
}
