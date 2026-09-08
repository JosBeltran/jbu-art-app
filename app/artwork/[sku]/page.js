import { getArtworkBySku } from '@/lib/artworks'
import ArtworkDetailClient from './ArtworkDetailClient'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export async function generateMetadata({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)
  if (!artwork) return { title: 'Obra no encontrada' }
  return { title: `${artwork.title} | Estudio JBU` }
}

export default async function ArtworkPage({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)

  if (!artwork) {
    notFound()
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Botón de Regresar al Catálogo */}
      <div className="mb-8">
        <Link 
          href="/" 
          className="inline-flex items-center text-xs font-bold text-gray-500 hover:text-black transition"
        >
          ← Volver al Catálogo
        </Link>
      </div>

      <ArtworkDetailClient artwork={artwork} />
    </main>
  )
}