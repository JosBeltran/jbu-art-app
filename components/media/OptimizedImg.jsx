'use client'

import { useState } from 'react'
import { imageVariants } from '@/lib/mediaVariants'
import { handleArtworkImageError } from '@/lib/artworkPlaceholder'

/**
 * Imagen de obra con versiones pre-generadas (thumbnail/medium/large).
 * Si la obra aún no está optimizada, cae al original sin romper nada.
 * @param {{ src: string, alt?: string, sizes?: string, variant?: 'thumbnail'|'medium'|'large', priority?: boolean, className?: string, style?: any, onClick?: any, onFinalError?: any, width?: number, height?: number }} props
 */
export default function OptimizedImg({ src, alt = '', sizes = '100vw', variant = 'medium', priority = false, className = undefined, style = undefined, onClick = undefined, onFinalError = undefined, width = undefined, height = undefined }) {
  const variants = imageVariants(src)
  const [useOriginal, setUseOriginal] = useState(!variants)

  const common = {
    alt,
    className,
    style,
    onClick,
    width,
    height,
    decoding: 'async',
    loading: priority ? 'eager' : 'lazy',
    fetchPriority: priority ? 'high' : undefined,
  }

  if (useOriginal || !variants) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...common} src={src} onError={onFinalError || handleArtworkImageError} />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...common}
      src={variants[variant]}
      srcSet={variants.srcSet}
      sizes={sizes}
      onError={() => setUseOriginal(true)}
    />
  )
}
