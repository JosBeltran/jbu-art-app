'use client'

import { Tag, ProgressBar } from '@carbon/react'
import { getTierProgress } from '@/lib/gamification'
import { useI18n } from '@/components/I18nProvider'
import styles from './TierProgressBar.module.css'

const money = (value, locale) => `$${Number(value || 0).toLocaleString(locale)}`

export default function TierProgressBar({ impactScore = 0, calculatedPriceMxn, basePriceMxn }) {
  const { t, lang, locale } = useI18n()
  const { currentTier, nextTier, progressPercentage, pointsNeeded } = getTierProgress(impactScore)

  const tierName = (tier) => (lang === 'en' ? (tier.name_en || tier.name) : tier.name)

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div>
          <Tag type="purple" size="sm">Tier {currentTier.tier} · {tierName(currentTier)}</Tag>
          <p className={styles.score}>
            {Number(impactScore).toLocaleString(locale)}
            <span className={styles.scoreUnit}>{t('puntos de impacto', 'impact points')}</span>
          </p>
        </div>
        <div>
          <span className={styles.multiplierLabel}>{t('Multiplicador', 'Multiplier')}</span>
          <span className={styles.multiplier}>{currentTier.multiplier}x</span>
        </div>
      </div>

      <ProgressBar
        value={progressPercentage}
        max={100}
        label={t('Progreso de tier', 'Tier progress')}
        hideLabel
        status="active"
      />

      <div className={styles.progressFooter}>
        <span>{Number(impactScore).toLocaleString(locale)} pts</span>
        {nextTier ? (
          <span>{t(`Faltan ${Number(pointsNeeded).toLocaleString(locale)} pts para ${tierName(nextTier)}`, `${Number(pointsNeeded).toLocaleString(locale)} pts to reach ${tierName(nextTier)}`)}</span>
        ) : (
          <span className={styles.maxTier}>{t('Nivel máximo alcanzado', 'Maximum level reached')}</span>
        )}
      </div>

      {(basePriceMxn || calculatedPriceMxn) && (
        <div className={styles.priceRow}>
          <span>{t('Precio base', 'Base price')}: {money(basePriceMxn, locale)} MXN</span>
          <span className={styles.priceCurrent}>{t('Sugerido actual', 'Current suggested')}: {money(calculatedPriceMxn || basePriceMxn, locale)} MXN</span>
        </div>
      )}
    </div>
  )
}
