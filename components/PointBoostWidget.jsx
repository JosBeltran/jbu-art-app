'use client'

import { useState } from 'react'
import { InlineLoading, InlineNotification } from '@carbon/react'
import { Rocket } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './PointBoostWidget.module.css'

const PACKAGES = [
  { name: 'Bronce', name_en: 'Bronze', points: 500, price: 50, label: 'Impulso Bronce', label_en: 'Bronze Boost' },
  { name: 'Plata', name_en: 'Silver', points: 1200, price: 100, label: 'Impulso Plata', label_en: 'Silver Boost' },
  { name: 'Oro', name_en: 'Gold', points: 2500, price: 200, label: 'Impulso Oro', label_en: 'Gold Boost', featured: true }
]

export default function PointBoostWidget({ artworkId, artworkSku, currentUserId }) {
  const { t, lang, locale } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBoost = async (pointsAmount, priceMxn, packageName) => {
    setError('')

    if (!currentUserId) {
      setError(t('Inicia sesión para impulsar esta obra.', 'Sign in to boost this artwork.'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/checkout/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworkId,
          artworkSku,
          userId: currentUserId,
          pointsAmount,
          priceMxn,
          packageName
        })
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(t('No fue posible iniciar el pago del impulso. Intenta de nuevo.', 'Could not start the boost payment. Please try again.'))
      }
    } catch (err) {
      console.error(err)
      setError(t('Ocurrió un error al conectar con el pago.', 'An error occurred while connecting to payment.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <Rocket size={18} />
        <h3 className={styles.title}>{t('Impulsar esta obra', 'Boost this artwork')}</h3>
      </div>

      <p className={styles.text}>
        {t('Aporta puntos para subir el tier de la pieza, ganar XP y figurar entre sus impulsores.', 'Contribute points to raise the piece\'s tier, earn XP, and appear among its boosters.')}
      </p>

      <div className={styles.options}>
        {PACKAGES.map((pkg) => (
          <button
            key={pkg.name}
            type="button"
            disabled={loading}
            onClick={() => handleBoost(pkg.points, pkg.price, lang === 'en' ? pkg.label_en : pkg.label)}
            className={`${styles.option} ${pkg.featured ? styles.optionFeatured : ''}`}
          >
            <span className={styles.optionName}>{lang === 'en' ? pkg.name_en : pkg.name}</span>
            <span className={styles.optionPoints}>+{pkg.points.toLocaleString(locale)} pts</span>
            <span className={styles.optionPrice}>${pkg.price} MXN</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className={styles.loading}>
          <InlineLoading description={t('Preparando el pago seguro...', 'Preparing secure payment...')} />
        </div>
      )}

      {error && (
        <div className={styles.notice}>
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('No se pudo continuar', 'Could not continue')}
            subtitle={error}
          />
        </div>
      )}
    </div>
  )
}
