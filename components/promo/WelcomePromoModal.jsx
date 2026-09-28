'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Close } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './WelcomePromo.module.css'

const DISMISS_KEY = 'jbu-welcome-promo-dismissed'
const DISMISS_DAYS = 14

function recentlyDismissed() {
  const at = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
  return at && Date.now() - at < DISMISS_DAYS * 86400000
}

// Invitación no bloqueante: aparece tras ~30% de scroll, solo a visitantes sin sesión
// y solo mientras el servidor confirme que quedan lugares.
export default function WelcomePromoModal({ session }) {
  const { t } = useI18n()
  const router = useRouter()
  const [promo, setPromo] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (session || recentlyDismissed() || window.sessionStorage.getItem(DISMISS_KEY)) return
    let active = true
    fetch('/api/promo').then((r) => r.json()).then((d) => { if (active && d?.active) setPromo(d) }).catch(() => {})
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!promo || session) return
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max > 0 && window.scrollY / max >= 0.3) {
        setOpen(true)
        window.sessionStorage.setItem(DISMISS_KEY, '1')
        window.removeEventListener('scroll', onScroll)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [promo, session])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setOpen(false)
  }

  if (!open || !promo || session) return null
  const pct = promo.percentOff || 30

  return (
    <aside className={styles.invite} role="dialog" aria-modal="false" aria-labelledby="welcome-promo-title">
      <button type="button" className={styles.close} onClick={dismiss} aria-label={t('Cerrar', 'Close')} title={t('Cerrar', 'Close')}>
        <Close size={20} />
      </button>
      <p className={styles.label}>{t('Invitación', 'Invitation')}</p>
      <p className={styles.percent}>{pct}%</p>
      <h2 id="welcome-promo-title" className={styles.title}>{t('Bienvenido a JBU', 'Welcome to JBU')}</h2>
      <p className={styles.copy}>
        {t(`Oferta de bienvenida: recibe ${pct}% en tu primera compra.`, `Welcome offer: get ${pct}% off your first purchase.`)}
      </p>
      {promo.remaining > 0 && promo.remaining < 5 && (
        <p className={styles.remaining}>
          {promo.remaining === 1 ? t('Queda 1 invitación', '1 invitation left') : t(`Quedan ${promo.remaining} invitaciones`, `${promo.remaining} invitations left`)}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
            router.push(`/signup?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)
          }}
        >
          {t('Crear cuenta', 'Create account')}
        </button>
        <button type="button" className={styles.secondary} onClick={dismiss}>{t('Ahora no', 'Not now')}</button>
      </div>
    </aside>
  )
}
