'use client'

import { Tag, ProgressBar } from '@carbon/react'
import { getTierProgress } from '@/lib/gamification'
import { useI18n } from '@/components/I18nProvider'
import styles from './TierProgressBar.module.css'

const money = (value, locale) => `${Number(value || 0).toLocaleString(locale)}`

// View milestones are informational and deliberately separate from paid impact points.
const VIEW_MILESTONES = [
  { views: 0, es: 'Primeras miradas', en: 'First impressions' },
  { views: 100, es: 'En descubrimiento', en: 'Getting discovered' },
  { views: 500, es: 'En crecimiento', en: 'Growing reach' },
  { views: 2000, es: 'Gran alcance', en: 'Wide reach' },
  { views: 5000, es: 'Alcance destacado', en: 'Featured reach' }
]

function getViewProgress(viewsCount) {
  const views = Math.max(0, Math.trunc(Number(viewsCount) || 0))
  let currentIndex = 0
  for (let i = VIEW_MILESTONES.length - 1; i >= 0; i--) {
    if (views >= VIEW_MILESTONES[i].views) {
      currentIndex = i
      break
    }
  }
  const current = VIEW_MILESTONES[currentIndex]
  const next = VIEW_MILESTONES[currentIndex + 1] || null
  const percentage = next
    ? Math.min(100, Math.round(((views - current.views) / (next.views - current.views)) * 100))
    : 100
  return { views, current, next, percentage }
}

export default function TierProgressBar({ impactScore = 0, viewsCount = 0, calculatedPriceMxn, basePriceMxn }) {
  const { t, lang, locale } = useI18n()
  const { currentTier, nextTier, progressPercentage, pointsNeeded } = getTierProgress(impactScore)

  const viewProgress = getViewProgress(viewsCount)

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

      <div className={styles.viewsSection}>
        <div className={styles.viewsHead}>
          <div>
            <span className={styles.viewsLabel}>{t('Alcance de la obra', 'Artwork reach')}</span>
            <p className={styles.viewsCount}>
              {viewProgress.views.toLocaleString(locale)}
              <span className={styles.scoreUnit}>{t('vistas registradas', 'recorded views')}</span>
            </p>
          </div>
          <span className={styles.viewsStage}>{lang === 'en' ? viewProgress.current.en : viewProgress.current.es}</span>
        </div>
        <ProgressBar
          value={viewProgress.percentage}
          max={100}
          label={t('Progreso de visitas', 'View milestone progress')}
          hideLabel
          status="active"
        />
        <div className={styles.progressFooter}>
          <span>{viewProgress.views.toLocaleString(locale)} {t('vistas', 'views')}</span>
          <span>{viewProgress.next
            ? t(
                `Faltan ${(viewProgress.next.views - viewProgress.views).toLocaleString(locale)} para ${viewProgress.next.views.toLocaleString(locale)} vistas`,
                `${(viewProgress.next.views - viewProgress.views).toLocaleString(locale)} more to reach ${viewProgress.next.views.toLocaleString(locale)} views`
              )
            : t('Máximo hito de alcance alcanzado', 'Highest reach milestone reached')}</span>
        </div>
        <p className={styles.viewsNote}>{t(
          'Las vistas muestran el interés por esta obra; no modifican los puntos de impacto ni el precio.',
          'Views indicate interest in this artwork; they do not change impact points or pricing.'
        )}</p>
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
