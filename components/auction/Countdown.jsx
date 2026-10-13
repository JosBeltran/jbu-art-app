'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import styles from './Auction.module.css'

/** Cuenta regresiva basada en la hora del servidor (offset). */
export function useRemaining(target, offset = 0) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(Date.now() + offset)
    const id = setInterval(() => setNow(Date.now() + offset), 1000)
    return () => clearInterval(id)
  }, [offset])
  if (!target || now === null) return null
  return Math.max(0, new Date(target).getTime() - now)
}

export function splitTime(ms) {
  const s = Math.floor(ms / 1000)
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

export function compactRemaining(ms) {
  if (ms == null) return ''
  const { d, h, m, s } = splitTime(ms)
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** @param {{ target: string, offset?: number, onEnd?: () => void, compact?: boolean }} props */
export default function Countdown({ target, offset = 0, onEnd = undefined, compact = false }) {
  const { t } = useI18n()
  const ms = useRemaining(target, offset)
  useEffect(() => { if (ms === 0 && onEnd) onEnd() }, [ms === 0])
  if (ms == null) return <span className={styles.countdown} aria-hidden="true">&nbsp;</span>
  if (compact) return <span className={styles.countdownCompact}>{compactRemaining(ms)}</span>
  const { d, h, m, s } = splitTime(ms)
  const parts = d > 0
    ? [[d, t('días', 'days')], [h, t('horas', 'hours')], [m, 'min']]
    : h > 0 ? [[h, t('horas', 'hours')], [m, 'min'], [s, 'seg']] : [[m, 'min'], [s, 'seg']]
  return (
    <span className={styles.countdown} role="timer" aria-live="off">
      {parts.map(([v, label], i) => (
        <span key={i} className={styles.countdownUnit}>
          <span className={styles.countdownValue}>{String(v).padStart(2, '0')}</span>
          <span className={styles.countdownLabel}>{label}</span>
        </span>
      ))}
    </span>
  )
}
