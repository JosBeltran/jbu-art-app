'use client'

import { useEffect } from 'react'
import { useCookieConsent } from '@/components/consent/CookieConsent'
import { useI18n } from '@/components/I18nProvider'
import { buildTidioContext } from '@/lib/tidioContext'
import { whenTidioReady } from './tidio'

/**
 * Envía a Tidio la obra que el visitante está viendo, para que aparezca en la conversación.
 * Only allowlisted public data; never send hidden prices or visitor identity.
 */
export default function TidioArtworkContext({ artwork }) {
  const { consent } = useCookieConsent()
  const { lang } = useI18n()
  const permitted = consent?.marketing === true
  const sku = artwork?.sku || ''
  useEffect(() => {
    if (!sku || !permitted) return
    return whenTidioReady((api) => {
      try {
        api.setContactProperties?.(buildTidioContext({ artwork, language: lang, url: window.location.href, referrer: document.referrer }))
      } catch {
        // Si Tidio rechaza un dato, el chat sigue funcionando.
      }
    })
  }, [artwork, sku, lang, permitted])
  return null
}
