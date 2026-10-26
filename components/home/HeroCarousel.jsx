'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from '@carbon/icons-react'
import OptimizedImg from '@/components/media/OptimizedImg'
import { videoVariants } from '@/lib/mediaVariants'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import styles from './HeroCarousel.module.css'

const AUTOPLAY_MS = 7000

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** Video del hero: solo el activo se reproduce; póster y preload mínimo. */
function HeroVideo({ slide, active, label }) {
  const derived = videoVariants(slide.url)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (active) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [active])
  return (
    <video
      ref={ref}
      className={styles.media}
      src={derived?.web || slide.url}
      poster={slide.posterUrl || derived?.poster || undefined}
      muted
      loop
      playsInline
      autoPlay={active}
      preload={active ? 'metadata' : 'none'}
      aria-label={label}
      onError={(e) => {
        const el = e.currentTarget
        if (derived?.web && el.src !== slide.url) el.src = slide.url
      }}
    />
  )
}

function ArtworkSlide({ slide, active, t, L }) {
  const artwork = slide.artwork
  return (
    <Link
      href={`/artwork/${artwork.sku}`}
      className={styles.slideLink}
      tabIndex={active ? 0 : -1}
      aria-hidden={!active}
    >
      <div className={styles.mediaWrap}>
        <OptimizedImg
          src={artwork.primary_image_url}
          alt={t(`${L(artwork, 'title')}, obra original de Josué Beltrán Uresti`, `${L(artwork, 'title')}, original artwork by Josué Beltrán Uresti`)}
          sizes="100vw"
          variant="large"
          priority={active}
          width={1600}
          height={1200}
          className={styles.media}
        />
      </div>
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.copy}>
        <p className={styles.eyebrow}>
          {t('Josué Beltrán y creativos invitados', 'Josué Beltrán & Invited Creatives')}
        </p>
        <h2 className={styles.title}>{L(artwork, 'title')}</h2>
        <span className={styles.action}>
          <span aria-hidden="true" /> {t('Ver obra', 'View artwork')}
        </span>
      </div>
    </Link>
  )
}

function CustomSlide({ slide, active, lang, t }) {
  const pick = (pair) => (lang === 'en' && pair.en ? pair.en : pair.es) || ''
  const title = pick(slide.title)
  const description = pick(slide.description)
  const cta = pick(slide.cta)
  const hasCopy = Boolean(title || description || (cta && slide.linkUrl))

  const media = slide.kind === 'VIDEO' ? (
    <HeroVideo slide={slide} active={active} label={title || t('Video del hero', 'Hero video')} />
  ) : (
    <OptimizedImg
      src={slide.url}
      alt={title || t('Imagen del hero', 'Hero image')}
      sizes="100vw"
      variant="large"
      priority={active}
      width={1600}
      height={1200}
      className={styles.media}
    />
  )

  const inner = (
    <>
      <div className={styles.mediaWrap}>{media}</div>
      {hasCopy && <div className={styles.shade} aria-hidden="true" />}
      {hasCopy && (
        <div className={styles.copy}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {description && <p className={styles.description}>{description}</p>}
          {cta && slide.linkUrl && (
            <span className={styles.action}>
              <span aria-hidden="true" /> {cta}
            </span>
          )}
        </div>
      )}
    </>
  )

  if (slide.linkUrl) {
    const external = /^https?:\/\//.test(slide.linkUrl)
    return external ? (
      <a
        href={slide.linkUrl}
        className={styles.slideLink}
        tabIndex={active ? 0 : -1}
        aria-hidden={!active}
        target="_blank"
        rel="noreferrer"
      >
        {inner}
      </a>
    ) : (
      <Link href={slide.linkUrl} className={styles.slideLink} tabIndex={active ? 0 : -1} aria-hidden={!active}>
        {inner}
      </Link>
    )
  }
  return <div className={styles.slideLink}>{inner}</div>
}

/**
 * Carousel editorial del Hero: loop continuo, autoplay pausado al interactuar,
 * navegación manual discreta, teclado, touch y prefers-reduced-motion.
 * @param {{ slides: any[] }} props slides normalizados por lib/heroSlides.js
 */
export default function HeroCarousel({ slides }) {
  const { t, lang } = useI18n()
  const L = useLocalized()
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef(null)
  const count = slides.length

  const goTo = useCallback((next) => {
    setIndex(((next % count) + count) % count)
  }, [count])

  // Autoplay: se detiene con reduced-motion, al interactuar o con una sola diapositiva.
  useEffect(() => {
    if (reducedMotion || paused || count < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS)
    return () => clearInterval(id)
  }, [reducedMotion, paused, count])

  const pauseTemporarily = () => {
    setPaused(true)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); pauseTemporarily(); goTo(index - 1) }
    if (e.key === 'ArrowRight') { e.preventDefault(); pauseTemporarily(); goTo(index + 1) }
  }

  const onTouchStart = (e) => { touchStartX.current = e.touches[0]?.clientX ?? null }
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 40) return
    pauseTemporarily()
    goTo(index + (dx < 0 ? 1 : -1))
  }

  if (count === 0) return null

  return (
    <section
      className={styles.hero}
      aria-roledescription="carousel"
      aria-label={t('Destacados', 'Featured')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false) }}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.track}>
        {slides.map((slide, i) => (
          <div
            key={slide.type === 'artwork' ? slide.artwork.id : slide.url}
            className={`${styles.slide} ${i === index ? styles.slideActive : ''}`}
            aria-hidden={i !== index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${count}`}
          >
            {slide.type === 'artwork'
              ? <ArtworkSlide slide={slide} active={i === index} t={t} L={L} />
              : <CustomSlide slide={slide} active={i === index} lang={lang} t={t} />}
          </div>
        ))}
      </div>

      {count > 1 && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => { pauseTemporarily(); goTo(index - 1) }}
            aria-label={t('Anterior', 'Previous')}
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          <div className={styles.dots} role="tablist" aria-label={t('Diapositivas', 'Slides')}>
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
                onClick={() => { pauseTemporarily(); goTo(i) }}
                aria-label={t(`Ir a la diapositiva ${i + 1}`, `Go to slide ${i + 1}`)}
              />
            ))}
          </div>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => { pauseTemporarily(); goTo(index + 1) }}
            aria-label={t('Siguiente', 'Next')}
          >
            <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </section>
  )
}
