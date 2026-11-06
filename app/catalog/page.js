import { getCatalogData } from '@/lib/catalogData.server'
import { promotionalPageMetadata } from '@/lib/social/promotional.server'
import CatalogClient from './CatalogClient'
import CatalogHero from './CatalogHero'
import styles from './Catalog.module.css'

export const revalidate = 0

export async function generateMetadata({ searchParams }) {
  const query = await searchParams
  const language = query?.lang === 'en' || query?.lang === 'es' ? query.lang : undefined
  return promotionalPageMetadata('catalog', { language })
}

export default async function CatalogPage() {
  const { artworks, seriesNames, printArtworkIds, siteSettings } = await getCatalogData()

  return (
    <main className={styles.shell}>
      <CatalogHero count={artworks.length} />
      <div className={styles.content}>
        <CatalogClient initialArtworks={artworks} seriesNames={seriesNames} printArtworkIds={printArtworkIds} siteSettings={siteSettings} />
      </div>
    </main>
  )
}
