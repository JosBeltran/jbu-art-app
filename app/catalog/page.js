import { getCatalogData } from '@/lib/catalogData.server'
import { promotionalPageMetadata } from '@/lib/social/promotional.server'
import CatalogClient from './CatalogClient'
import CatalogHero from './CatalogHero'
import styles from './Catalog.module.css'

export const revalidate = 0

export async function generateMetadata({ searchParams }) {
  const query = await searchParams
  const language = query?.lang === 'en' || query?.lang === 'es' ? query.lang : undefined
  const prints = query?.prints === 'true'
  const meta = await promotionalPageMetadata(prints ? 'prints' : 'catalog', { language })
  if (!prints) return meta
  // Keep filtered catalog URLs shareable without duplicating the /prints SEO index.
  return {
    ...meta,
    alternates: { canonical: 'https://www.josuebeltranuresti.com/catalog' },
    openGraph: { ...meta.openGraph, url: 'https://www.josuebeltranuresti.com/catalog?prints=true' },
  }
}

export default async function CatalogPage({ searchParams }) {
  const params = await searchParams
  const { artworks, seriesNames, printArtworkIds, printImageMap, countryOptions, siteSettings } =
    await getCatalogData({ country: params?.country, printsOnly: params?.prints === 'true' })

  return (
    <main className={styles.shell}>
      <CatalogHero count={artworks.length} />
      <div className={styles.content}>
        <CatalogClient initialArtworks={artworks} seriesNames={seriesNames} printArtworkIds={printArtworkIds} printImageMap={printImageMap} countryOptions={countryOptions} siteSettings={siteSettings} />
      </div>
    </main>
  )
}
