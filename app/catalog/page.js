import { getArtworks } from '@/lib/artworks'
import { supabase } from '@/lib/supabaseClient'
import CatalogClient from './CatalogClient'
import CatalogHero from './CatalogHero'
import styles from './Catalog.module.css'

export const revalidate = 0

const CATALOG_TITLE = 'Original Contemporary Art | Josué Beltrán Uresti'
const CATALOG_DESC = 'Original contemporary artworks by Mexican artist and creative Josué Beltrán Uresti: abstract painting, mixed media, resin and works on paper from Monterrey, each with a certificate of authenticity.'
export const metadata = {
  title: { absolute: CATALOG_TITLE },
  description: CATALOG_DESC,
  alternates: { canonical: 'https://www.josuebeltranuresti.com/catalog' },
  openGraph: { title: CATALOG_TITLE, description: CATALOG_DESC, type: 'website', url: 'https://www.josuebeltranuresti.com/catalog', siteName: 'Josué Beltrán Uresti', images: [{ url: 'https://www.josuebeltranuresti.com/opengraph-image.jpg', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: CATALOG_TITLE, description: CATALOG_DESC },
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
