'use client'

import { useEffect } from 'react'
import { Button } from '@carbon/react'
import { Close, ChevronLeft, ChevronRight, Image as ImageIcon } from '@carbon/icons-react'
import styles from './ArtworkLightbox.module.css'

export default function ArtworkLightbox({
  isOpen,
  onClose,
  images = /** @type {any[]} */ ([]),
  currentIndex = 0,
  onSelectIndex,
  artworkTitle,
  seriesArtworks = /** @type {any[]} */ ([]),
  onSelectSeriesArtwork
}) {
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

      <div className={styles.stage}>
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

      {(images.length > 1 || seriesArtworks.length > 0) && (
        <div className={styles.footer}>
          {images.length > 1 && (
            <div className={styles.thumbRow}>
              {images.map((img, idx) => {
                const url = img?.url || img
                const isSelected = idx === currentIndex
                return (
                  <button
                    type="button"
                    key={`${url}-${idx}`}
                    onClick={() => onSelectIndex(idx)}
                    aria-label={`Ver imagen ${idx + 1}`}
                    className={`${styles.thumb} ${isSelected ? styles.thumbActive : ''}`}
                  >
                    <img src={formatImgSrc(url)} alt={`Miniatura ${idx + 1}`} />
                  </button>
                )
              })}
            </div>
          )}

          {seriesArtworks.length > 0 && (
            <div className={styles.seriesRow}>
              <span className={styles.seriesLabel}>
                <ImageIcon size={14} /> Misma serie
              </span>
              {seriesArtworks.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={styles.seriesItem}
                  onClick={() => onSelectSeriesArtwork(item)}
                >
                  <img
                    src={formatImgSrc(item.primary_image_url)}
                    alt={item.title}
                    onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
                  />
                  <div className={styles.seriesText}>
                    <p className={styles.seriesTitle}>{item.title}</p>
                    <p className={styles.seriesPrice}>
                      ${Number(item.base_price_mxn || 0).toLocaleString('es-MX')} MXN
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
