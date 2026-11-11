import { getPublicPrintCollection } from '@/lib/publicPrintDiscovery.server'
import { promotionalPageMetadata } from '@/lib/social/promotional.server'
import PrintCollection from './PrintCollection'
import PromotionalLandingTitle from '@/components/catalog/PromotionalLandingTitle'
import styles from '@/app/catalog/Catalog.module.css'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }) {
  const q = await searchParams
  return promotionalPageMetadata('prints', { language: q?.lang })
}

export default async function PrintsPage({ searchParams }) {
  const query = await searchParams
  const { options: printOptions, countries } = await getPublicPrintCollection(query?.country)
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <p className={styles.kicker}>JBU · FINE ART PRINTS</p>
        <PromotionalLandingTitle />
      </div>
    </header>
    <div className={styles.content}>
      <PrintCollection options={printOptions} countries={countries} />
    </div>
  </main>
}
