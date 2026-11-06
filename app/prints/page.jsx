import { getCatalogData } from '@/lib/catalogData.server'
import { promotionalPageMetadata } from '@/lib/social/promotional.server'
import CatalogClient from '@/app/catalog/CatalogClient'
import styles from '@/app/catalog/Catalog.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }) {
  const q = await searchParams
  return promotionalPageMetadata('prints', { language: q?.lang })
}

export default async function PrintsPage() {
  const { artworks, seriesNames, printArtworkIds, siteSettings } = await getCatalogData()
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <p className={styles.kicker}>JBU · FINE ART PRINTS</p>
        <h1 className={styles.title}>Fine Art Prints</h1>
      </div>
    </header>
    <div className={styles.content}>
      <CatalogClient initialArtworks={artworks} seriesNames={seriesNames}
        printArtworkIds={printArtworkIds} siteSettings={siteSettings} landingPrints />
    </div>
  </main>
}
