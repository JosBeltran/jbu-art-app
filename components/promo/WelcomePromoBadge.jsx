'use client'

import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/authHeaders'
import { useI18n } from '@/components/I18nProvider'
import styles from './WelcomePromo.module.css'

// Aviso discreto cuando el usuario tiene su 30% de bienvenida sin usar.
export default function WelcomePromoBadge() {
  const { t } = useI18n()
  const [promo, setPromo] = useState(null)
  useEffect(() => {
    let active = true
    authHeaders().then((headers) => {
      if (!headers.Authorization) return
      fetch('/api/promo', { headers }).then((r) => r.json()).then((d) => { if (active) setPromo(d) }).catch(() => {})
    })
    return () => { active = false }
  }, [])
  if (promo?.status !== 'CLAIMED') return null
  return (
    <p className={styles.badge}>
      <strong>{promo.percentOff || 30}%</strong> {t('de bienvenida disponible · se aplica al pagar', 'welcome discount available · applied at checkout')}
    </p>
  )
}
