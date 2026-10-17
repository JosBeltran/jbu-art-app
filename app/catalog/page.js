import { getArtworks } from '@/lib/artworks'
import { supabase } from '@/lib/supabaseClient'
import CatalogClient from './CatalogClient'
import styles from './Catalog.module.css'
import LogoJBU from '@/components/jbu/LogoJBU'

export const revalidate = 0

export const metadata = {
  title: 'Catálogo de obras | JBU',
  description: 'Explora obras originales, series y proyectos de estudio de Josué Beltrán Uresti.',
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
      <section className={styles.hero}>
        <LogoJBU variant="primary" decorative className={styles.watermark} />
        <div className={styles.heroInner}>
          <div className={styles.heroTop}>
            <p className={styles.kicker}>JBU · Archivo de obra</p>
            <p className={styles.kicker}>{artworks.length} obras</p>
          </div>
          <h1 className={styles.title}>Catálogo de obras</h1>
          <p className={styles.intro}>
            Obra original, series y proyectos de estudio. Cada pieza incluye su ficha técnica y registro de autenticidad.
          </p>
        </div>
      </section>
      <div className={styles.content}>
        <CatalogClient initialArtworks={artworks} seriesNames={seriesNames} />
      </div>
    </main>
  )
}
