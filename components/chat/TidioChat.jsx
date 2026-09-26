'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { whenTidioReady } from './tidio'

const SCRIPT_ID = 'tidio-chat-script'

// Rutas privadas donde no debe aparecer el chat de visitantes.
function isHiddenPath(pathname = '') {
  return pathname.startsWith('/admin')
}

/**
 * Carga el widget oficial de Tidio una sola vez para todo el sitio.
 * - No se reinyecta al cambiar de página.
 * - No se carga si el primer acceso es a /admin; si se entra a /admin después, se oculta.
 * - Disponibilidad (en línea / fuera de línea) la gestiona Tidio de forma nativa.
 */
export default function TidioChat() {
  const pathname = usePathname() || ''
  const { lang } = useI18n()
  const key = process.env.NEXT_PUBLIC_TIDIO_PUBLIC_KEY
  const hidden = isHiddenPath(pathname)

  // Idioma del widget (Tidio lo lee al iniciar).
  useEffect(() => {
    if (typeof document !== 'undefined') document.tidioChatLang = lang === 'en' ? 'en' : 'es'
  }, [lang])

  // Inyección única del script oficial.
  useEffect(() => {
    if (!key || hidden) return
    if (document.getElementById(SCRIPT_ID)) return
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = `https://code.tidio.co/${encodeURIComponent(key)}.js`
    script.async = true
    document.body.appendChild(script)
  }, [key, hidden])

  // Mostrar u ocultar según la ruta (sin volver a cargar nada).
  useEffect(() => {
    if (!key) return
    return whenTidioReady((api) => {
      if (hidden) api.hide()
      else api.show()
    })
  }, [key, hidden])

  return null
}
