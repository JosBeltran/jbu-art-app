import { notFound } from 'next/navigation'
import { getCatalogData } from '@/lib/catalogData.server'
import { promotionalPageMetadata, publicSeriesRows } from '@/lib/social/promotional.server'
import { findSeriesBySlug, seriesSlug } from '@/lib/social/promotional'
import CatalogClient from '@/app/catalog/CatalogClient'
import PromotionalLandingTitle from '@/components/catalog/PromotionalLandingTitle'
import styles from '@/app/catalog/Catalog.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params
  const q = await searchParams
  const meta = await promotionalPageMetadata('series', { slug, language: q?.lang })
  return meta || { title: 'Series not found', robots: { index: false, follow: false } }
}
export default async function PublicSeriesPage({ params }) {
  const { slug } = await params
  const { artworks, seriesNames, printArtworkIds, siteSettings } = await getCatalogData()
  const publicRows = await publicSeriesRows()
  const row = findSeriesBySlug(publicRows, slug)
  if (!row) {
    console.warn('[promotional-series] slug not found among published series', {
      requestedSlug: slug,
      availableSlugs: publicRows.map(seriesSlug),
    })
    notFound()
  }
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <p className={styles.kicker}>JBU · SERIES</p>
        <PromotionalLandingTitle series={row} />
      </div>
    </header>
    <div className={styles.content}>
      <CatalogClient initialArtworks={artworks} seriesNames={seriesNames}
        printArtworkIds={printArtworkIds} siteSettings={siteSettings} landingSeries={row.title} />
    </div>
  </main>
}
