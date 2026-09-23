'use client'

import { useEffect, useState } from 'react'
import { Button } from '@carbon/react'
import { Close, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from '@carbon/icons-react'
import styles from './ArtworkLightbox.module.css'

export default function ArtworkLightbox({
  isOpen,
  onClose,
  images = /** @type {any[]} */ ([]),
  currentIndex = 0,
  onSelectIndex,
  artworkTitle
}) {
  const [isZoomed, setIsZoomed] = useState(false)

  useEffect(() => {
    setIsZoomed(false)
  }, [currentIndex, isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && images.length > 1) {
        onSelectIndex((currentIndex - 1 + images.length) % images.length)
      }
      if (e.key === 'ArrowRight' && images.length > 1) {
        onSelectIndex((currentIndex + 1) % images.length)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentIndex, images.length, onClose, onSelectIndex])

  if (!isOpen) return null

  const activeImage = images[currentIndex] || images[0]

  const formatImgSrc = (url) => {
    if (!url) return '/placeholder.jpg'
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return url.startsWith('/') ? url : `/${url}`
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={`Vista ampliada de ${artworkTitle}`}>
      <div className={styles.header}>
        <div>
          <span className={styles.title}>{artworkTitle}</span>
          {images.length > 1 && (
            <span className={styles.counter}>{currentIndex + 1} / {images.length}</span>
          )}
        </div>

        <div className={styles.headerActions}>
          <Button
            className={styles.zoomButton}
            kind="ghost"
            size="md"
            renderIcon={isZoomed ? ZoomOut : ZoomIn}
            onClick={() => setIsZoomed((value) => !value)}
          >
            {isZoomed ? 'Ajustar' : 'Ampliar'}
          </Button>
          <Button
            className={styles.closeButton}
            kind="ghost"
            size="md"
            renderIcon={Close}
            onClick={onClose}
          >
            Cerrar
          </Button>
        </div>
      </div>

      <div className={`${styles.stage} ${isZoomed ? styles.stageZoomed : ''}`}>
        {images.length > 1 && (
          <Button
            className={`${styles.navButton} ${styles.navLeft}`}
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="Imagen anterior"
            tooltipPosition="right"
            kind="ghost"
            size="lg"
            onClick={() => onSelectIndex((currentIndex - 1 + images.length) % images.length)}
          />
        )}

        <img
          src={formatImgSrc(activeImage?.url || activeImage)}
          alt={`${artworkTitle} — vista ampliada`}
          onClick={() => setIsZoomed((value) => !value)}
          onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
        />

        {images.length > 1 && (
          <Button
            className={`${styles.navButton} ${styles.navRight}`}
            hasIconOnly
            renderIcon={ChevronRight}
            iconDescription="Imagen siguiente"
            tooltipPosition="left"
            kind="ghost"
            size="lg"
            onClick={() => onSelectIndex((currentIndex + 1) % images.length)}
          />
        )}
      </div>

      {images.length > 1 && (
        <div className={styles.footer}>
          <div className={styles.thumbRow} aria-label="Imágenes de esta obra">
            {images.map((img, idx) => {
              const url = img?.url || img
              const isSelected = idx === currentIndex
              return (
                <button
                  type="button"
                  key={`${url}-${idx}`}
                  onClick={() => onSelectIndex(idx)}
                  aria-label={idx === 0 ? 'Ver imagen principal' : `Ver imagen adicional ${idx}`}
                  className={`${styles.thumb} ${isSelected ? styles.thumbActive : ''}`}
                >
                  <img src={formatImgSrc(url)} alt={idx === 0 ? 'Imagen principal' : `Imagen adicional ${idx}`} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
