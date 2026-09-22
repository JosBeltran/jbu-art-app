'use client'

import { Tag, ProgressBar } from '@carbon/react'
import { getTierProgress } from '@/lib/gamification'
import styles from './TierProgressBar.module.css'

const money = (value) => `$${Number(value || 0).toLocaleString('es-MX')}`

export default function TierProgressBar({ impactScore = 0, calculatedPriceMxn, basePriceMxn }) {
  const { currentTier, nextTier, progressPercentage, pointsNeeded } = getTierProgress(impactScore)

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div>
          <Tag type="purple" size="sm">Tier {currentTier.tier} · {currentTier.name}</Tag>
          <p className={styles.score}>
            {Number(impactScore).toLocaleString('es-MX')}
            <span className={styles.scoreUnit}>puntos de impacto</span>
          </p>
        </div>
        <div>
          <span className={styles.multiplierLabel}>Multiplicador</span>
          <span className={styles.multiplier}>{currentTier.multiplier}x</span>
        </div>
      </div>

      <ProgressBar
        value={progressPercentage}
        max={100}
        label="Progreso de tier"
        hideLabel
        status="active"
      />

      <div className={styles.progressFooter}>
        <span>{Number(impactScore).toLocaleString('es-MX')} pts</span>
        {nextTier ? (
          <span>Faltan {Number(pointsNeeded).toLocaleString('es-MX')} pts para {nextTier.name}</span>
        ) : (
          <span className={styles.maxTier}>Nivel máximo alcanzado</span>
        )}
      </div>

      {(basePriceMxn || calculatedPriceMxn) && (
        <div className={styles.priceRow}>
          <span>Precio base: {money(basePriceMxn)} MXN</span>
          <span className={styles.priceCurrent}>Sugerido actual: {money(calculatedPriceMxn || basePriceMxn)} MXN</span>
        </div>
      )}
    </div>
  )
}
