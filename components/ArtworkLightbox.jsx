'use client'

import { useEffect } from 'react'
import { Button } from '@carbon/react'
import { Close, ChevronLeft, ChevronRight, Image as ImageIcon } from '@carbon/icons-react'

export default function ArtworkLightbox({
  isOpen,
  onClose,
  images = [],
  currentIndex = 0,
  onSelectIndex,
  artworkTitle,
  seriesArtworks = [], // Obras de la misma serie para la sección inferior
  onSelectSeriesArtwork // Función al hacer clic en una obra de la serie
}) {
  // Manejo de teclado (Escape para cerrar, flechas para navegar entre imágenes)
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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(14, 14, 14, 0.98)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.5rem',
        boxSizing: 'border-box'
      }}
    >
      {/* ========================================================= */}
      {/* CABECERA: TÍTULO Y BOTÓN DE CIERRE EXPLÍCITO               */}
      {/* ========================================================= */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', zIndex: 10000 }}>
        <div>
          <span style={{ color: '#fff', fontSize: '1.125rem', fontWeight: '600', display: 'block' }}>
            {artworkTitle}
          </span>
          <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
            Imagen {currentIndex + 1} de {images.length}
          </span>
        </div>

        <Button
          kind="danger"
          size="field"
          renderIcon={Close}
          onClick={onClose}
          style={{ backgroundColor: '#da1e28', border: 'none', color: '#fff' }}
        >
          Cerrar Vista
        </Button>
      </div>

      {/* ========================================================= */}
      {/* VISOR CENTRAL CON FLECHAS DE NAVEGACIÓN                   */}
      {/* ========================================================= */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '1rem 0', minHeight: 0 }}>
        {images.length > 1 && (
          <Button
            hasIconOnly
            renderIcon={ChevronLeft}
            iconDescription="Imagen anterior"
            kind="ghost"
            size="lg"
            onClick={() => onSelectIndex((currentIndex - 1 + images.length) % images.length)}
            style={{ position: 'absolute', left: '1rem', color: '#fff', zIndex: 10, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
        )}

        <img
          src={formatImgSrc(activeImage?.url || activeImage)}
          alt="Vista ampliada"
          style={{ maxWidth: '100%', maxHeight: '62vh', objectFit: 'contain', borderRadius: '0.25rem' }}
        />

        {images.length > 1 && (
          <Button
            hasIconOnly
            renderIcon={ChevronRight}
            iconDescription="Imagen siguiente"
            kind="ghost"
            size="lg"
            onClick={() => onSelectIndex((currentIndex + 1) % images.length)}
            style={{ position: 'absolute', right: '1rem', color: '#fff', zIndex: 10, backgroundColor: 'rgba(0,0,0,0.6)' }}
          />
        )}
      </div>

      {/* ========================================================= */}
      {/* SECCIÓN INFERIOR: MINIATURAS Y OBRAS DE LA MISMA SERIE    */}
      {/* ========================================================= */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
        
        {/* Fila 1: Imágenes adicionales / variantes de esta misma obra */}
        {images.length > 1 && (
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', justifyContent: 'center', paddingBottom: '0.25rem' }}>
            {images.map((img, idx) => {
              const url = img?.url || img
              const isSelected = idx === currentIndex
              return (
                <button
                  key={idx}
                  onClick={() => onSelectIndex(idx)}
                  style={{
                    width: '3.5rem',
                    height: '3.5rem',
                    border: isSelected ? '2px solid #0f62fe' : '2px solid transparent',
                    padding: 0,
                    background: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    borderRadius: '0.25rem',
                    overflow: 'hidden',
                    opacity: isSelected ? 1 : 0.5
                  }}
                >
                  <img src={formatImgSrc(url)} alt={`Miniatura ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              )
            })}
          </div>
        )}

        {/* Fila 2: Enlaces a otras obras de la misma serie */}
        {seriesArtworks.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            <span style={{ color: 'var(--cds-text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ImageIcon size={14} /> Misma Serie:
            </span>
            {seriesArtworks.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectSeriesArtwork(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '0.25rem',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <img src={formatImgSrc(item.primary_image_url)} alt={item.title} style={{ width: '2rem', height: '2rem', objectFit: 'cover', borderRadius: '2px' }} />
                <div style={{ textAlign: 'left' }}>
                  <p style={{ color: '#fff', fontSize: '0.75rem', fontWeight: '600', margin: 0, maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                  <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.625rem', margin: 0 }}>${Number(item.base_price_mxn || 0).toLocaleString('es-MX')} MXN</p>
                </div>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}