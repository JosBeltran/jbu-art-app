'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { getAnnouncementText } from '@/lib/announcement'
import { sanitizeAnnouncementHtml } from '@/lib/announcementHtml'
import styles from './AnnouncementBanner.module.css'

/**
 * Presentación del banner, compartida por el sitio público y la vista previa
 * de Admin > Home. Recibe HTML limitado (o texto plano) y SIEMPRE lo sanitiza
 * antes de renderizarlo. Sin contenido no renderiza nada.
 */
export function AnnouncementBannerView({ html, as = 'status', trackHeaderOffset = false }) {
  const bannerRef = useRef(null)
  // DOMParser solo existe en el navegador; se sanitiza tras montar para evitar
  // diferencias de hidratación.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const clean = useMemo(() => (mounted ? sanitizeAnnouncementHtml(html) : ''), [html, mounted])
  // Only the public banner owns this offset; Admin previews never affect it.
  useEffect(() => {
    if (!trackHeaderOffset || !clean || !bannerRef.current) return
    const banner = bannerRef.current
    const root = document.documentElement
    const updateOffset = () => {
      root.style.setProperty('--jbu-announcement-height', `${banner.getBoundingClientRect().height}px`)
    }
    updateOffset()
    const observer = new ResizeObserver(updateOffset)
    observer.observe(banner)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--jbu-announcement-height')
    }
  }, [clean, trackHeaderOffset])
  if (!clean) return null

  return (
    <div ref={bannerRef} className={`${styles.banner} ${trackHeaderOffset ? styles.publicBanner : ''}`} role={as}>
      <div className={styles.text} dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  )
}

/**
 * Barra informativa superior del sitio público (Announcement Banner).
 *
 * Se configura en Admin > Home y usa el idioma activo del sitio. Cuando está
 * desactivada o aún no hay configuración no renderiza nada, así no deja
 * espacio vacío encima del encabezado.
 */
export default function AnnouncementBanner() {
  const { lang } = useI18n()
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    let active = true
    supabase
      .from('site_settings')
      .select('announcement_enabled, announcement_text_es, announcement_text_en')
      .eq('id', true)
      .maybeSingle()
      .then(({ data, error }) => {
        // Si la migración aún no se aplica, el banner simplemente no aparece.
        if (active && !error) setSettings(data)
      })
    return () => { active = false }
  }, [])

  const text = getAnnouncementText(settings, lang)
  if (!text) return null

  return <AnnouncementBannerView html={text} trackHeaderOffset />
}
