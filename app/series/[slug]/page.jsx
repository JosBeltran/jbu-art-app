import { notFound } from 'next/navigation'
import { getCatalogData } from '@/lib/catalogData.server'
import { promotionalPageMetadata, publicSeriesRows } from '@/lib/social/promotional.server'
import { findSeriesBySlug, seriesSlug } from '@/lib/social/promotional'
import CatalogClient from '@/app/catalog/CatalogClient'
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
  const row = findSeriesBySlug(await publicSeriesRows(), slug)
  if (!row) notFound()
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <p className={styles.kicker}>JBU · SERIES</p>
        <h1 className={styles.title}>{row.name_es || row.title}</h1>
      </div>
    </header>
    <div className={styles.content}>
      <CatalogClient initialArtworks={artworks} seriesNames={seriesNames}
        printArtworkIds={printArtworkIds} siteSettings={siteSettings} landingSeries={row.title} />
    </div>
  </main>
}
