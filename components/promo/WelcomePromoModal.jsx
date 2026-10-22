'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Close } from '@carbon/icons-react'
import LogoJBU from '@/components/jbu/LogoJBU'
import { useI18n } from '@/components/I18nProvider'
import { getArtworks } from '@/lib/artworks'
import styles from './WelcomePromo.module.css'

const DISMISS_KEY = 'jbu-welcome-promo-dismissed'
const DISMISS_DAYS = 14

function recentlyDismissed() {
  const at = Number(window.localStorage.getItem(DISMISS_KEY) || 0)
  return at && Date.now() - at < DISMISS_DAYS * 86400000
}

// Experiencia de bienvenida a pantalla completa: 10% en el primer pedido.
// Aparece tras ~30% de scroll, solo a visitantes sin sesión y mientras la
// campaña siga activa. El beneficio se registra por correo y el servidor
// verifica la elegibilidad (sin pedidos previos, una sola vez por correo).
export default function WelcomePromoModal({ session }) {
  const { t } = useI18n()
  const router = useRouter()
  const [promo, setPromo] = useState(null)
  const [open, setOpen] = useState(false)
  const [image, setImage] = useState(null)
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState('form') // form | submitting | success
  const [error, setError] = useState('')

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

  // Imagen destacada aleatoria de una Serie activa con imagen principal válida.
  useEffect(() => {
    if (!open) return
    let active = true
    getArtworks({ limit: 60 }).then((works) => {
      if (!active) return
      const candidates = (works || []).filter((a) => a.featured && (a.primary_image_url || a.image_url))
      if (candidates.length) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)]
        setImage(pick.primary_image_url || pick.image_url)
      }
    }).catch(() => {})
    return () => { active = false }
  }, [open])

  // Bloquea el desplazamiento de la página mientras la experiencia está abierta.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setOpen(false)
  }

  async function submit(e) {
    e.preventDefault()
    if (phase === 'submitting') return
    setError('')
    setPhase('submitting')
    try {
      const res = await fetch('/api/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data?.status === 'CLAIMED') {
        setPhase('success')
        window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
      } else if (data?.status === 'INVALID_EMAIL') {
        setError(t('Escribe un correo válido.', 'Enter a valid email address.'))
        setPhase('form')
      } else if (data?.status === 'NOT_ELIGIBLE' || data?.status === 'REDEEMED') {
        setError(t('Este correo ya usó su beneficio de bienvenida.', 'This email has already used its welcome benefit.'))
        setPhase('form')
      } else {
        setError(t('La promoción no está disponible en este momento.', 'The promotion is not available right now.'))
        setPhase('form')
      }
    } catch {
      setError(t('No se pudo completar el registro. Inténtalo de nuevo.', 'Could not complete the registration. Please try again.'))
      setPhase('form')
    }
  }

  if (!open || !promo || session) return null
  const pct = promo.percentOff || 10

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="welcome-promo-title">
      <button
        type="button"
        className={styles.closeBtn}
        onClick={dismiss}
        aria-label={t('Cerrar promoción', 'Close promotion')}
        title={t('Cerrar', 'Close')}
      >
        <Close size={20} />
      </button>

      <div className={styles.panel}>
        <LogoJBU variant="primary" size={30} decorative className={styles.logo} />
        <p className={styles.accessLabel}>{t('JBU · Acceso privado', 'JBU · Private access')}</p>

        {phase === 'success' ? (
          <>
            <h2 id="welcome-promo-title" className={styles.headline}>
              {t('Tu 10% está desbloqueado', 'Your 10% is unlocked')}
            </h2>
            <p className={styles.subcopy}>
              {t(
                'El descuento se aplicará automáticamente en tu primera compra de arte original.',
                'The discount will be applied automatically on your first purchase of original art.'
              )}
            </p>
            <button type="button" className={styles.cta} onClick={() => router.push('/catalog')}>
              {t('Explorar arte original', 'Explore original art')}
            </button>
          </>
        ) : (
          <>
            <h2 id="welcome-promo-title" className={styles.headline}>
              {t(`Desbloquea ${pct}% en tu primer pedido`, `Unlock ${pct}% off your first order`)}
            </h2>
            <p className={styles.subcopy}>
              {t(
                'Únete a JBU y recibe un descuento en tu primera compra de arte original.',
                'Join JBU and receive a discount on your first purchase of original art.'
              )}
            </p>
            <form className={styles.form} onSubmit={submit} noValidate>
              <label className={styles.fieldLabel} htmlFor="welcome-promo-email">
                {t('Correo electrónico', 'Email address')}
              </label>
              <input
                id="welcome-promo-email"
                type="email"
                required
                autoComplete="email"
                className={styles.emailInput}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@correo.com"
              />
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button type="submit" className={styles.cta} disabled={phase === 'submitting'}>
                {phase === 'submitting' ? t('Procesando…', 'Processing…') : t(`Desbloquear mi ${pct}%`, `Unlock my ${pct}%`)}
              </button>
            </form>
            <p className={styles.legal}>
              {t('Al continuar aceptas los', 'By continuing you accept the')}{' '}
              <a href="/info/terminos-de-servicio">{t('Términos y Condiciones', 'Terms & Conditions')}</a>
              {' · '}
              <a href="/info/politica-de-privacidad">{t('Política de Privacidad', 'Privacy Policy')}</a>
            </p>
          </>
        )}
      </div>

      <div className={styles.media} aria-hidden="true">
        {image && <img src={image} alt="" className={styles.mediaImg} />}
      </div>
    </div>
  )
}
