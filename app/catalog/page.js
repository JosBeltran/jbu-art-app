import { getArtworks } from '@/lib/artworks'
import { supabase } from '@/lib/supabaseClient'
import CatalogClient from './CatalogClient'
import CatalogHero from './CatalogHero'
import styles from './Catalog.module.css'

export const revalidate = 0

export const metadata = {
  title: 'Catálogo de obras | JBU',
  description: 'Explora obras originales, series y proyectos de estudio de Josué Beltrán Uresti.',
  openGraph: { title: 'Catálogo de obras | JBU', description: 'Obras originales y Series activas de Josué Beltrán Uresti.', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export default async function CatalogPage() {
  const artworks = (await getArtworks()) || []
  // Solo textos de nombre para mostrar el filtro en el idioma elegido; no cambia qué obras se ven.
  let seriesNames = []
  try {
    const { data } = await supabase.from('series').select('*')
    seriesNames = (data || []).map((s) => ({ title: s.title, name_es: s.name_es ?? null, name_en: s.name_en ?? null }))
  } catch {
    seriesNames = []
  }

  return (
    <main className={styles.shell}>
      <CatalogHero count={artworks.length} />
      <div className={styles.content}>
        <CatalogClient initialArtworks={artworks} seriesNames={seriesNames} />
      </div>
    </main>
  )
}
