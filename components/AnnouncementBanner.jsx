'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { getAnnouncementText } from '@/lib/announcement'
import styles from './AnnouncementBanner.module.css'

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

  return (
    <div className={styles.banner} role="status">
      <p className={styles.text}>{text}</p>
    </div>
  )
}
