'use client'

import { useI18n } from '@/components/I18nProvider'
import LogoJBU from '@/components/jbu/LogoJBU'
import styles from './Catalog.module.css'

// Cabecera editorial del catálogo. Solo presentación y textos ES/EN;
// no toca la retícula, filtros, orden ni datos de obras.
export default function CatalogHero({ count = 0 }) {
  const { t } = useI18n()

  return (
    <section className={styles.hero}>
      <LogoJBU variant="primary" decorative className={styles.watermark} />
      <div className={styles.heroInner}>
        <div className={styles.heroTop}>
          <p className={styles.kicker}>{t('JBU · Archivo de obra', 'JBU · Works archive')}</p>
          <p className={styles.kicker}>
            {count} {t('obras', 'works')}
          </p>
        </div>
        <h1 className={styles.title}>{t('Arte contemporáneo original', 'Original Contemporary Art')}</h1>
        <p className={styles.intro}>
          {t(
            'Obra original, series activas y proyectos de estudio. Cada pieza incluye ficha técnica y registro de autenticidad.',
            'Original works, active series and studio projects. Each piece includes technical details and an authenticity record.'
          )}
        </p>
      </div>
    </section>
  )
}
