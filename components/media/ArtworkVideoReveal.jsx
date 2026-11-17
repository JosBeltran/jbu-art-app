'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import ThemedOverlay from '@/components/overlays/ThemedOverlay'
import styles from './ArtworkVideoReveal.module.css'
import { videoVariants } from '@/lib/mediaVariants'

/**
 * Introducción cinemática al entrar a una obra.
 * - status 'waiting': aún se busca el video (pantalla negra breve).
 * - Si no hay video, falla o tarda, se cierra sola y la ficha se ve normal.
 *
 * @param {{ src?: string | null, poster?: string | null, title?: string, waiting?: boolean, onDone: () => void }} props
 */
export default function ArtworkVideoReveal({ src, poster = null, title = '', waiting = false, onDone }) {
  const { t } = useI18n()
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(false)
  const videoRef = useRef(null)
  const derived = videoVariants(src)
  const [useOriginal, setUseOriginal] = useState(!derived)
  const playSrc = useOriginal || !derived ? src : derived.web

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setLeaving(true)
  }, [])
  // State-driven scheduling survives StrictMode's effect replay, while actual
  // unmount still cancels completion before it can affect another screen.
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(onDone, 700)
    return () => window.clearTimeout(timer)
  }, [leaving, onDone])

  // Movimiento reducido: no se reproduce la introducción.
  useEffect(() => {
    if (!doneRef.current && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      doneRef.current = true
      onDone()
    }
  }, [onDone])

  // Seguridad: si el video no aparece o no arranca, la ficha se abre igual.
  useEffect(() => {
    if (!waiting && !src) { finish(); return }
    const timer = window.setTimeout(() => {
      const v = videoRef.current
      if (!v || v.paused) finish()
    }, waiting ? 3000 : 5000)
    return () => window.clearTimeout(timer)
  }, [src, waiting, finish])

  return (
    <ThemedOverlay open onClose={finish} theme="g100" initialFocus="button">
    <div tabIndex={-1} className={`${styles.overlay} ${leaving ? styles.leaving : ''}`} role="dialog" aria-modal="true" aria-label={t('Introducción de la obra', 'Artwork introduction')}>
      {src && (
        <video
          ref={videoRef}
          className={styles.video}
          key={playSrc}
          src={playSrc}
          poster={poster || derived?.poster || undefined}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={finish}
          onError={() => { if (!useOriginal && derived) setUseOriginal(true); else finish() }}
        />
      )}
      <div className={styles.caption}>
        <span className={styles.kicker}>JBU</span>
        {title && <span className={styles.title}>{title}</span>}
      </div>
      <button type="button" className={styles.skip} onClick={finish}>
        {t('Saltar', 'Skip')}
      </button>
    </div>
    </ThemedOverlay>
  )
}
