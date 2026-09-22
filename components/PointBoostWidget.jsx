'use client'

import { useState } from 'react'
import { InlineLoading, InlineNotification } from '@carbon/react'
import { Rocket } from '@carbon/icons-react'
import styles from './PointBoostWidget.module.css'

const PACKAGES = [
  { name: 'Bronce', points: 500, price: 50, label: 'Impulso Bronce' },
  { name: 'Plata', points: 1200, price: 100, label: 'Impulso Plata' },
  { name: 'Oro', points: 2500, price: 200, label: 'Impulso Oro', featured: true }
]

export default function PointBoostWidget({ artworkId, artworkSku, currentUserId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleBoost = async (pointsAmount, priceMxn, packageName) => {
    setError('')

    if (!currentUserId) {
      setError('Inicia sesión para impulsar esta obra.')
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
        setError('No fue posible iniciar el pago del impulso. Intenta de nuevo.')
      }
    } catch (err) {
      console.error(err)
      setError('Ocurrió un error al conectar con el pago.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <Rocket size={18} />
        <h3 className={styles.title}>Impulsar esta obra</h3>
      </div>

      <p className={styles.text}>
        Aporta puntos para subir el tier de la pieza, ganar XP y figurar entre sus impulsores.
      </p>

      <div className={styles.options}>
        {PACKAGES.map((pkg) => (
          <button
            key={pkg.name}
            type="button"
            disabled={loading}
            onClick={() => handleBoost(pkg.points, pkg.price, pkg.label)}
            className={`${styles.option} ${pkg.featured ? styles.optionFeatured : ''}`}
          >
            <span className={styles.optionName}>{pkg.name}</span>
            <span className={styles.optionPoints}>+{pkg.points.toLocaleString('es-MX')} pts</span>
            <span className={styles.optionPrice}>${pkg.price} MXN</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className={styles.loading}>
          <InlineLoading description="Preparando el pago seguro..." />
        </div>
      )}

      {error && (
        <div className={styles.notice}>
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="No se pudo continuar"
            subtitle={error}
          />
        </div>
      )}
    </div>
  )
}
