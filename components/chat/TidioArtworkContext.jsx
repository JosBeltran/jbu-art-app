'use client'

import { useEffect } from 'react'
import { whenTidioReady } from './tidio'

/**
 * Envía a Tidio la obra que el visitante está viendo, para que aparezca en la conversación.
 * Solo datos públicos: título, SKU, serie, URL e ID de la obra.
 */
export default function TidioArtworkContext({ artwork }) {
  const sku = artwork?.sku || ''
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_TIDIO_PUBLIC_KEY || !sku) return
    return whenTidioReady((api) => {
      try {
        api.setContactProperties?.({
          artwork_title: artwork?.title || '',
          artwork_sku: sku,
          artwork_series: artwork?.series || '',
          artwork_id: artwork?.id ? String(artwork.id) : '',
          artwork_url: window.location.href,
        })
        api.addVisitorTags?.([`obra-${sku}`])
      } catch {
        // Si Tidio rechaza un dato, el chat sigue funcionando.
      }
    })
  }, [sku, artwork?.title, artwork?.series, artwork?.id])
  return null
}
