'use client'

import { useState } from 'react'
import { useI18n } from '@/components/I18nProvider'

export default function ArtworkImage({ title, primaryUrl, sku, className = "object-cover w-full h-full" }) {
  const { t } = useI18n()
  // 1. Resolver si es URL remota de Supabase / HTTP o si es un path relativo local
  let initialUrl = null

  if (primaryUrl) {
    if (primaryUrl.startsWith('http://') || primaryUrl.startsWith('https://')) {
      // Es URL completa de Supabase Storage o CDN externo
      initialUrl = primaryUrl
    } else {
      // Es una ruta local o relativa (ej: "assets-optimized/artworks/foto.jpg")
      // Aseguramos que empiece con "/" para buscar desde public
      initialUrl = primaryUrl.startsWith('/') ? primaryUrl : `/${primaryUrl}`
    }
  } else if (sku) {
    // Si primaryUrl viene nulo/vacío, armamos la ruta local directa con el SKU
    initialUrl = `/assets-optimized/artworks/${sku}.jpg`
  }

  // 2. Ruta de respaldo local por si falla la URL inicial
  const localFallbackUrls = sku
    ? [
        `/assets-optimized/artworks/${sku}.webp`,
        `/assets-optimized/artworks/${sku}-FULL.webp`,
        `/assets-optimized/artworks/${sku}.jpg`,
      ]
    : []

  const [currentSrc, setCurrentSrc] = useState(initialUrl)
  const [fallbackIndex, setFallbackIndex] = useState(0)
  const [hasError, setHasError] = useState(false)

  const handleError = () => {
    const nextFallback = localFallbackUrls.findIndex(
      (candidate, index) => index >= fallbackIndex && candidate !== currentSrc
    )

    if (nextFallback >= 0) {
      setFallbackIndex(nextFallback + 1)
      setCurrentSrc(localFallbackUrls[nextFallback])
      return
    }

    setHasError(true)
  }

  if (hasError || !currentSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-stone-400 font-mono italic p-4 text-center bg-stone-50 border border-stone-200">
        {t('[Sin fotografía]', '[No photograph]')}
      </div>
    )
  }

  return (
    <img
      src={currentSrc}
      alt={title || t('Obra de arte', 'Artwork')}
      className={className}
      onError={handleError}
    />
  )
}