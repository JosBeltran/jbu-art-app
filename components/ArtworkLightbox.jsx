'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@carbon/react'
import { Chat, Close, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from '@carbon/icons-react'
import styles from './ArtworkLightbox.module.css'
import { useI18n } from '@/components/I18nProvider'
import { ARTWORK_PLACEHOLDER } from '@/lib/artworkPlaceholder'
import { VideoSlide } from '@/components/media/MediaGallery'
import OptimizedImg from '@/components/media/OptimizedImg'

const subscribe = () => () => {}
const clientReady = () => true
const serverReady = () => false

export default function ArtworkLightbox({
  isOpen,
  onClose,
  images = /** @type {any[]} */ ([]),
  currentIndex = 0,
  renderDiscussion = /** @type {((image: any) => import('react').ReactNode) | undefined} */ (undefined),
  canDiscuss = /** @type {((image: any) => boolean) | undefined} */ (undefined),
  discussionPanel = /** @type {import('react').ReactNode} */ (null),
  discussionOnly = false,
  startDiscussion = false,
  discussionLabel = '',
  onDiscussChange = /** @type {((active: boolean) => void) | undefined} */ (undefined),
  onSelectIndex = /** @type {((index: number) => void) | undefined} */ (undefined),
  artworkTitle
}) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady)
  const { t } = useI18n()
  const [isZoomed, setIsZoomed] = useState(false)
  const [discussing, setDiscussing] = useState(false)
  const discussion = discussionOnly || startDiscussion || discussing
  const touchStart = useRef(null)
  const dialog = useRef(null)
  const closeButton = useRef(null)
  const discussButton = useRef(null)
  const backToPhoto = useRef(null)

  useEffect(() => {
    if (!isOpen || !ready) return
    const element = dialog.current
    const trigger = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    closeButton.current?.focus({ preventScroll: true })
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [isOpen, ready])

  function dismiss() {
    setDiscussing(false)
    setIsZoomed(false)
    onDiscussChange?.(false)
    onClose()
  }

  function showDiscussion() {
    setIsZoomed(false)
    setDiscussing(true)
    onDiscussChange?.(true)
  }

  function hideDiscussion() {
    setDiscussing(false)
    onDiscussChange?.(false)
    requestAnimationFrame(() => discussButton.current?.focus({ preventScroll: true }))
  }

  useEffect(() => {
    if (ready && isOpen && discussion && !discussionOnly) backToPhoto.current?.focus({ preventScroll: true })
  }, [discussion, isOpen, discussionOnly, ready])

  if (!isOpen || !ready) return null

  const activeImage = images[currentIndex] || images[0]
  const isVideo = activeImage?.type === 'video'
  const step = (dir) => {
    setIsZoomed(false)
    onSelectIndex?.((currentIndex + dir + images.length) % images.length)
  }
  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchStart.current == null || images.length < 2 || isZoomed || discussion) return
    const dx = e.changedTouches[0].clientX - touchStart.current
    touchStart.current = null
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1)
  }

  const formatImgSrc = (url) => {
    if (!url) return ARTWORK_PLACEHOLDER
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return url.startsWith('/') ? url : `/${url}`
  }

  return (
    <dialog ref={dialog} className={`${styles.overlay} ${discussion ? styles.discussionMode : ''}`}
      aria-label={`${discussion ? discussionLabel || t('Comentarios sobre', 'Discussion on') : t('Vista ampliada de', 'Enlarged view of')} ${artworkTitle}`}
      onCancel={event => { event.preventDefault(); dismiss() }}
      onKeyDown={event => {
        if (discussion || images.length < 2) return
        if (event.key === 'ArrowLeft') step(-1)
        if (event.key === 'ArrowRight') step(1)
      }}>
      <div className={styles.header}>
        <div>
          <span className={styles.title}>{discussion ? t('Comentarios', 'Discussion') : artworkTitle}</span>
          {!discussion && images.length > 0 && (
            <span className={styles.counter} aria-live="polite">{currentIndex + 1} / {images.length}</span>

          )}
        </div>

        <div className={styles.headerActions}>
          {!discussion && renderDiscussion && activeImage && !isVideo && (!canDiscuss || canDiscuss(activeImage)) && <Button ref={discussButton}
            kind="ghost" size="sm" hasIconOnly renderIcon={Chat}
            iconDescription={t('Comentar esta imagen', 'Discuss this image')} onClick={showDiscussion} />}
          {discussion && !discussionOnly && <Button ref={backToPhoto} kind="ghost" size="sm" onClick={hideDiscussion}>
            {t('Ver foto', 'View photo')}
          </Button>}
          {!discussion && !isVideo && <Button
            className={styles.zoomButton}
            kind="ghost"
            size="md"
            renderIcon={isZoomed ? ZoomOut : ZoomIn}
            onClick={() => setIsZoomed((value) => !value)}
          >
            {isZoomed ? t('Ajustar', 'Fit') : t('Ampliar', 'Zoom')}
          </Button>}
          <Button
            ref={closeButton}
            className={styles.closeButton}
            kind="ghost"
            size="md"
            renderIcon={Close}
            onClick={dismiss}
          >
            {t('Cerrar', 'Close')}
          </Button>
        </div>
      </div>

      <div className={discussion ? `${styles.discussionBody} ${activeImage ? styles.withPhoto : ''}` : styles.viewerBody}>
        {activeImage && <div className={`${styles.stage} ${isZoomed && !discussion ? styles.stageZoomed : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {!discussion && images.length > 1 && (
            <Button
              className={`${styles.navButton} ${styles.navLeft}`}
              hasIconOnly
              renderIcon={ChevronLeft}
              iconDescription={t('Imagen anterior', 'Previous image')}
              tooltipPosition="right"
              kind="ghost"
              size="lg"
              onClick={() => step(-1)}
            />
          )}

          {isVideo ? (
            <div key={activeImage.url} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <VideoSlide item={activeImage} />
            </div>
          ) : (
            // Visor: versión grande; el original solo si aún no existe la versión optimizada.
            <OptimizedImg
              key={formatImgSrc(activeImage?.url || activeImage)}
              src={formatImgSrc(activeImage?.url || activeImage)}
              variant="large"
              sizes={discussion ? "(max-width: 800px) 100vw, 60vw" : "100vw"}
              priority
              alt={activeImage?.alt || `${artworkTitle} — ${t('vista ampliada', 'enlarged view')}`}
              onClick={discussion ? undefined : () => setIsZoomed((value) => !value)}
            />
          )}

          {!discussion && images.length > 1 && (
            <Button
              className={`${styles.navButton} ${styles.navRight}`}
              hasIconOnly
              renderIcon={ChevronRight}
              iconDescription={t('Imagen siguiente', 'Next image')}
              tooltipPosition="left"
              kind="ghost"
              size="lg"
              onClick={() => step(1)}
            />
          )}
        </div>}
        {discussion && (discussionPanel || renderDiscussion?.(activeImage))}
      </div>

      {!discussion && images.length > 1 && (
        <div className={styles.footer}>
          <div className={styles.thumbRow} aria-label={t('Imágenes de esta obra', 'Images of this artwork')}>
            {images.map((img, idx) => {
              const url = img?.url || img
              const isSelected = idx === currentIndex
              return (
                <button
                  type="button"
                  key={`${url}-${idx}`}
                  onClick={() => { setIsZoomed(false); onSelectIndex?.(idx) }}
                  aria-pressed={isSelected}
                  aria-label={img?.type === 'video' ? t('Ver video', 'View video') : idx === 0 ? t('Ver imagen principal', 'View main image') : `${t('Ver imagen adicional', 'View additional image')} ${idx}`}
                  className={`${styles.thumb} ${isSelected ? styles.thumbActive : ''}`}
                >
                  {img?.type === 'video' ? (
                    img.poster ? <img src={img.poster} alt={t('Video', 'Video')} /> : <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '.625rem', letterSpacing: '.1em' }}>▶ VIDEO</span>
                  ) : (
                    <OptimizedImg src={formatImgSrc(url)} variant="thumbnail" sizes="96px" alt={idx === 0 ? t('Imagen principal', 'Main image') : `${t('Imagen adicional', 'Additional image')} ${idx}`} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </dialog>
  )
}
