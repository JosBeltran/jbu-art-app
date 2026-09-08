'use client'

import { useState } from 'react'

export default function ArtworkImage({ title, primaryUrl, sku, className = "object-cover w-full h-full" }) {
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
  const localFallbackUrl = sku ? `/assets-optimized/artworks/${sku}.jpg` : null

  const [currentSrc, setCurrentSrc] = useState(initialUrl)
  const [hasError, setHasError] = useState(false)

  const handleError = () => {
    // Si falló la URL inicial (ej. Supabase dio 404/CORS) y tenemos una ruta local por SKU:
    if (localFallbackUrl && currentSrc !== localFallbackUrl) {
      setCurrentSrc(localFallbackUrl)
    } else {
      // Si la local también falló o no existe
      setHasError(true)
    }
  }

  if (hasError || !currentSrc) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-stone-400 font-mono italic p-4 text-center bg-stone-50 border border-stone-200">
        [Sin fotografía]
      </div>
    )
  }

  return (
    <img
      src={currentSrc}
      alt={title || 'Obra de arte'}
      className={className}
      onError={handleError}
    />
  )
}