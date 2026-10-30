'use client'

import { useEffect, useMemo, useState } from 'react'
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
export function AnnouncementBannerView({ html, as = 'status' }) {
  // DOMParser solo existe en el navegador; se sanitiza tras montar para evitar
  // diferencias de hidratación.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const clean = useMemo(() => (mounted ? sanitizeAnnouncementHtml(html) : ''), [html, mounted])
  if (!clean) return null

  return (
    <div className={styles.banner} role={as}>
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

  return <AnnouncementBannerView html={text} />
}
