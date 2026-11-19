'use client'

import { useRef, useState } from 'react'
import { Button } from '@carbon/react'
import { ChevronLeft, ChevronRight, Maximize } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { DiscussionButton } from '@/components/comments/ArtworkDiscussion'
import ArtworkLightbox from '@/components/ArtworkLightbox'
import OptimizedImg from './OptimizedImg'
import styles from './PrintGallery.module.css'

export default function PrintGallery({ images, title, variantId = '', children = null, renderDiscussion, initialDiscussion = null, onDiscussionDismiss }) {
  const { t } = useI18n()
  const touch = useRef(null)
  const [selection, setSelection] = useState(() => ({
    variantId, index: Math.max(0, images.findIndex(image => image.url === initialDiscussion)),
    open: initialDiscussion !== null, discussion: initialDiscussion !== null,
  }))
  if (selection.variantId !== variantId) {
    setSelection({ variantId, index: 0, open: false })
    return null
  }
  const { index, open, discussion } = selection
  const setIndex = next => setSelection(current => ({ ...current, index: next }))
  const setOpen = next => setSelection(current => ({ ...current, open: next }))
  const activeIndex = Math.min(index, images.length - 1)
  const active = images[activeIndex]
  if (!active) return null

  const multiple = images.length > 1
  const step = direction => setIndex((activeIndex + direction + images.length) % images.length)
  const previous = t('Imagen anterior', 'Previous image')
  const next = t('Imagen siguiente', 'Next image')

  return (
    <div className={children ? `${styles.gallery} ${styles.editorial}` : styles.gallery}>
      <div className={styles.stage} role="group" aria-label={t('Galería del print', 'Print gallery')}>
        <button type="button" className={styles.enlarge} onClick={() => setOpen(true)}
          aria-label={t('Ampliar imagen del print', 'Enlarge print image')}
          onTouchStart={event => {
            const point = event.touches[0]
            touch.current = { x: point.clientX, y: point.clientY }
          }}
          onTouchCancel={() => { touch.current = null }}
          onTouchEnd={event => {
            const start = touch.current
            touch.current = null
            if (!multiple || !start) return
            const point = event.changedTouches[0]
            const dx = point.clientX - start.x
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(point.clientY - start.y)) {
              event.preventDefault()
              step(dx < 0 ? 1 : -1)
            }
          }}>
          <OptimizedImg key={active.url} src={active.url} alt={active.alt || title}
            sizes="(max-width: 800px) 92vw, 52vw" />
          <span className={styles.maximize} aria-hidden="true"><Maximize size={18} /></span>
        </button>
        {multiple && <div className={styles.navigation}>
          <Button type="button" hasIconOnly kind="ghost" size="sm" renderIcon={ChevronLeft}
            iconDescription={previous} onClick={() => step(-1)} />
          <span aria-live="polite">{activeIndex + 1} / {images.length}</span>
          <Button type="button" hasIconOnly kind="ghost" size="sm" renderIcon={ChevronRight}
            iconDescription={next} onClick={() => step(1)} />
        </div>}
        {renderDiscussion && <div className={styles.discuss}>
          <DiscussionButton onClick={() => setSelection(current => ({ ...current, open: true, discussion: true }))}>
            {t('Comentar esta foto del print', 'Discuss this print photo')}
          </DiscussionButton>
        </div>}
      </div>
      {children && <div className={styles.identity}>{children}</div>}
      {multiple && <div className={styles.thumbnails}>
        {images.map((image, position) => (
          <button type="button" key={position + ':' + image.url} aria-pressed={position === activeIndex}
            aria-label={t(`Ver imagen ${position + 1}`, `View image ${position + 1}`)}
            onClick={() => setIndex(position)}>
            <OptimizedImg src={image.url} variant="thumbnail" sizes="60px" alt="" />
          </button>
        ))}
      </div>}
      <ArtworkLightbox isOpen={open} onClose={() => setOpen(false)} images={images}
        renderDiscussion={renderDiscussion} startDiscussion={discussion}
        onDiscussChange={active => {
          if (active) return
          setSelection(current => ({ ...current, discussion: false }))
          if (initialDiscussion !== null) onDiscussionDismiss?.()
        }}
        currentIndex={activeIndex} onSelectIndex={setIndex} artworkTitle={title} />
    </div>
  )
}
