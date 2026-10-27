'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { useCookieConsent } from '@/components/consent/CookieConsent'
import { whenTidioReady } from './tidio'
import { buildTidioContext, canLoadTidio, TIDIO_SCRIPT_ID, TIDIO_SCRIPT_SRC } from '@/lib/tidioContext'

/**
 * Carga el widget oficial de Tidio una sola vez para todo el sitio.
 * - No se reinyecta al cambiar de página.
 * - No se carga si el primer acceso es a /admin; si se entra a /admin después, se oculta.
 * - Disponibilidad (en línea / fuera de línea) la gestiona Tidio de forma nativa.
 */
export default function TidioChat() {
  const pathname = usePathname() || ''
  const { consent } = useCookieConsent()
  const { lang } = useI18n()
  const permitted = canLoadTidio(pathname, consent)
  const [prepared, setPrepared] = useState(null)

  // Idioma del widget (Tidio lo lee al iniciar).
  useEffect(() => {
    document.tidioChatLang = lang === 'en' ? 'en' : 'es'
    setPrepared(lang)
  }, [lang])

  // Mostrar u ocultar según la ruta (sin volver a cargar nada).
  useEffect(() => {
    return whenTidioReady((api) => {
      if (!permitted) api.hide?.()
      else {
        api.show?.()
        // Clear stale artwork context when leaving its detail page.
        if (!/^\/artwork\/[^/]+\/?$/.test(pathname)) {
          api.setContactProperties?.(buildTidioContext({ language: lang, url: window.location.href, referrer: document.referrer }))
        }
      }
    })
  }, [pathname, permitted, lang])

  if (prepared !== lang || !permitted) return null
  return <Script id={TIDIO_SCRIPT_ID} src={TIDIO_SCRIPT_SRC} strategy="afterInteractive" async onError={() => {
    // No direct, version-pinned fallback: the official URL carries widget configuration.
    console.warn('Tidio could not load; the site remains available.')
  }} />
}
