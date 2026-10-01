'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Maximize, PlayFilledAlt } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { canOptimize } from '@/lib/artworkMedia'
import { handleArtworkImageError } from '@/lib/artworkPlaceholder'
import styles from './MediaGallery.module.css'

/** Video con póster y reproducción explícita: no descarga el archivo hasta que se pulsa. */
/** @param {{ item: any, label?: string, autoPlayOnMount?: boolean }} props */
export function VideoSlide({ item, label = '', autoPlayOnMount = false }) {
  const { t } = useI18n()
  const [playing, setPlaying] = useState(autoPlayOnMount)

  if (playing) {
    return (
      <video
        className={styles.video}
        src={item.url}
        poster={item.poster}
        controls
        autoPlay
        playsInline
        preload="metadata"
        aria-label={item.alt}
      />
    )
  }

  return (
    <button type="button" className={styles.videoPoster} onClick={() => setPlaying(true)} aria-label={label || t('Reproducir video', 'Play video')}>
      {item.poster ? (
        <img src={item.poster} alt="" loading="lazy" />
      ) : (
        <video src={`${item.url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" />
      )}
      <span className={styles.play}><PlayFilledAlt size={20} /></span>
    </button>
  )
}

/** @param {{ item: any, sizes?: string, priority?: boolean, className?: string }} props */
export function MediaImage({ item, sizes = '100vw', priority = false, className = undefined }) {
  if (canOptimize(item.url)) {
    return (
      <Image
        src={item.url}
        alt={item.alt || ''}
        width={1600}
        height={2000}
        sizes={sizes}
        quality={85}
        priority={priority}
        loading={priority ? undefined : 'lazy'}
        className={className}
        onError={handleArtworkImageError}
      />
    )
  }
  return <img src={item.url} alt={item.alt || ''} loading={priority ? 'eager' : 'lazy'} className={className} onError={handleArtworkImageError} />
}

/** @param {{ items?: any[], onOpen?: (idx: number) => void }} props */
export default function MediaGallery({ items = [], onOpen }) {
  const { t } = useI18n()
  const trackRef = useRef(null)
  const [active, setActive] = useState(0)
  const multiple = items.length > 1

  const goTo = useCallback((idx) => {
    const track = trackRef.current
    const slide = track?.children?.[idx]
    if (!track || !slide) return
    track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' })
    setActive(idx)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track || !multiple) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const idx = Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
        setActive(Math.min(items.length - 1, Math.max(0, idx)))
      })
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => { track.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [items.length, multiple])

  if (items.length === 0) return null

  return (
    <div className={`${styles.gallery} ${multiple ? '' : styles.single}`}>
      {multiple && (
        <div className={styles.thumbs} role="tablist" aria-label={t('Medios de la obra', 'Artwork media')}>
          {items.map((item, idx) => (
            <button
              key={`${item.url}-${idx}`}
              type="button"
              role="tab"
              aria-selected={active === idx}
              aria-label={item.type === 'video' ? t(`Ver video (${idx + 1})`, `View video (${idx + 1})`) : t(`Ver imagen ${idx + 1}`, `View image ${idx + 1}`)}
              className={`${styles.thumb} ${active === idx ? styles.thumbActive : ''}`}
              onClick={() => goTo(idx)}
            >
              {item.type === 'video' ? (
                <span className={styles.thumbVideo}>
                  {item.poster ? <img src={item.poster} alt="" loading="lazy" /> : null}
                  <PlayFilledAlt size={14} />
                </span>
              ) : (
                <MediaImage item={{ ...item, alt: '' }} sizes="96px" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className={styles.stageWrap}>
        <div ref={trackRef} className={styles.track}>
          {items.map((item, idx) => (
            <div key={`${item.url}-${idx}`} className={styles.slide} aria-roledescription="slide" aria-label={`${idx + 1} / ${items.length}`}>
              {item.type === 'video' ? (
                <div className={styles.videoWrap}>
                  <VideoSlide item={item} />
                  <button type="button" className={styles.expand} onClick={() => onOpen?.(idx)} aria-label={t('Ver en pantalla completa', 'View fullscreen')}>
                    <Maximize size={16} />
                  </button>
                </div>
              ) : (
                <button type="button" className={styles.stage} onClick={() => onOpen?.(idx)} aria-label={t('Ampliar imagen', 'Enlarge image')}>
                  <MediaImage item={item} sizes="(max-width: 900px) 100vw, 60vw" priority={idx === 0} />
                  <span className={styles.zoomHint}><Maximize size={16} /> {t('Ampliar', 'Enlarge')}</span>
                </button>
              )}
            </div>
          ))}
        </div>
        {multiple && (
          <div className={styles.dots} aria-hidden="true">
            {items.map((item, idx) => (
              <span key={idx} className={`${styles.dot} ${active === idx ? styles.dotActive : ''} ${item.type === 'video' ? styles.dotVideo : ''}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
