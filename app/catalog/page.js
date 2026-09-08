import { getArtworks } from '@/lib/artworks'
import CatalogClient from './CatalogClient'

export const revalidate = 60 // Revalida datos cada 60 segundos (ISR)

export default async function CatalogPage() {
  const artworks = await getArtworks()

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-10 text-center sm:text-left">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Catálogo de Obras</h1>
        <p className="mt-2 text-base text-gray-600">
          Explora la colección original de arte contemporáneo y proyectos de estudio.
        </p>
      </header>

      <CatalogClient initialArtworks={artworks} />
    </main>
  )
}