'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import OptimizedImg from '@/components/media/OptimizedImg'
import { videoVariants } from '@/lib/mediaVariants'
import { seriesHref } from '@/lib/homeSeries'
import { getLocalizedSeriesContent } from '@/lib/seriesContent'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import styles from './SeriesSections.module.css'

function altFor(L, t, artwork) {
  const title = L(artwork, 'title')
  return t(`${title}, obra original de Josué Beltrán Uresti`, `${title}, original artwork by Josué Beltrán Uresti`)
}

function ArtworkFigure({ artwork, variant, sizes, large = false }) {
  const { t } = useI18n()
  const L = useLocalized()
  return (
    <Link href={`/artwork/${artwork.sku}`} className={`${styles.figure} ${large ? styles.figureLarge : ''}`}>
      <span className={styles.frame}>
        <OptimizedImg src={artwork.primary_image_url} alt={altFor(L, t, artwork)} variant={variant} sizes={sizes} width={1200} height={1500} className={styles.image} />
      </span>
      <span className={styles.caption}>
        <span className={styles.captionTitle}>{L(artwork, 'title')}</span>
        <span className={styles.captionMeta}>{[artwork.year, artwork.dimensions].filter(Boolean).join(' · ')}</span>
      </span>
    </Link>
  )
}

function SeriesHead({ series, eyebrow }) {
  const { lang } = useI18n()
  const c = getLocalizedSeriesContent(series, lang)
  return (
    <header className={styles.head}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 className={styles.title}>{c.name}</h2>
      {c.subtitle && <p className={styles.subtitle}>{c.subtitle}</p>}
      {(c.shortDescription || c.description) && <p className={styles.description}>{c.shortDescription || c.description}</p>}
    </header>
  )
}

function SeriesSection({ section }) {
  const { t, lang } = useI18n()
  const { series, main, secondary, layout } = section
  const c = getLocalizedSeriesContent(series, lang)
  const solo = secondary.length === 0
  return (
    <section className={`${styles.section} ${styles[`layout_${layout}`]} ${solo ? styles.solo : ''}`} aria-label={c.name}>
      <SeriesHead series={series} eyebrow={t('Serie', 'Series')} />
      <div className={styles.composition}>
        <div className={styles.mainSlot}>
          <ArtworkFigure artwork={main} variant="large" large sizes="(max-width: 900px) 100vw, 60vw" />
        </div>
        {!solo && (
          <div className={styles.secondary}>
            {secondary.map((a) => (
              <ArtworkFigure key={a.id} artwork={a} variant="medium" sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 25vw" />
            ))}
          </div>
        )}
      </div>
      <Link href={seriesHref(series)} className={styles.cta}>
        {series.cta_label || t('Ver serie', 'View series')} <ArrowRight size={16} aria-hidden />
      </Link>
    </section>
  )
}

function useCountdown(date, enabled) {
  const [now, setNow] = useState(null)
  useEffect(() => {
    if (!enabled || !date) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(id)
  }, [date, enabled])
  if (!enabled || !date || now === null) return null
  const diff = new Date(date).getTime() - now
  if (diff <= 0) return null
  return { days: Math.floor(diff / 86400000), hours: Math.floor((diff % 86400000) / 3600000) }
}

function LazyTeaserVideo({ src, poster, label }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  const derived = videoVariants(src)
  const [current, setCurrent] = useState(derived?.web || src)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect() } }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  if (failed) return null
  return (
    <video
      ref={ref}
      className={styles.teaserMedia}
      src={visible ? current : undefined}
      poster={poster || derived?.poster || undefined}
      muted
      loop
      playsInline
      autoPlay={visible}
      preload="none"
      aria-label={label}
      onError={() => { if (current !== src) setCurrent(src); else setFailed(true) }}
    />
  )
}

function ComingSoonSection({ section }) {
  const { t, locale, lang } = useI18n()
  const { series } = section
  const c = getLocalizedSeriesContent(series, lang)
  const [imageFailed, setImageFailed] = useState(false)
  const countdown = useCountdown(series.launch_date, series.show_countdown)
  const when = series.launch_date
    ? new Date(series.launch_date).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    : null
  const hasVideo = Boolean(series.teaser_video_url)
  const hasImage = Boolean(series.teaser_image_url) && !imageFailed
  const hasMedia = hasVideo || hasImage
  const content = (
    <>
      <div className={styles.soonCopy}>
        <p className={styles.eyebrow}>{t('Nueva serie', 'New series')}</p>
        <h2 className={styles.soonTitle}>{c.name}</h2>
        {c.subtitle && <p className={styles.subtitle}>{c.subtitle}</p>}
        {when && <p className={styles.soonDate}>{t(`Llega en ${when}`, `Coming ${when}`)}</p>}
        {countdown && (
          <p className={styles.countdown} aria-live="polite">
            {t(`${countdown.days} días · ${countdown.hours} h`, `${countdown.days} days · ${countdown.hours} h`)}
          </p>
        )}
        {c.shortDescription && <p className={styles.description}>{c.shortDescription}</p>}
        <span className={styles.ctaQuiet}>{series.cta_label || t('Muy pronto', 'Explore soon')}</span>
      </div>
      {hasMedia && (
        <div className={styles.teaser}>
          {hasVideo ? (
            <LazyTeaserVideo src={series.teaser_video_url} poster={series.teaser_image_url} label={c.name} />
          ) : (
            <OptimizedImg src={series.teaser_image_url} alt={c.name} variant="large" sizes="(max-width: 900px) 100vw, 55vw" className={styles.teaserMedia} onFinalError={() => setImageFailed(true)} />
          )}
        </div>
      )}
    </>
  )
  return (
    <section className={`${styles.section} ${styles.soon} ${hasMedia ? '' : styles.soonBare}`} aria-label={c.name}>
      {series.cta_url ? <Link href={series.cta_url} className={styles.soonLink}>{content}</Link> : content}
    </section>
  )
}

function OutletSection({ section }) {
  const { t } = useI18n()
  return (
    <section className={`${styles.section} ${styles.outlet}`} aria-labelledby="home-selection">
      <header className={styles.head}>
        <p className={styles.eyebrow}>{t('Selección especial', 'Special selection')}</p>
        <h2 id="home-selection" className={styles.title}>{t('Selección del coleccionista', 'Collector selection')}</h2>
      </header>
      <div className={styles.outletGrid}>
        {section.works.map((a) => (
          <ArtworkFigure key={a.id} artwork={a} variant="medium" sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 33vw" />
        ))}
      </div>
    </section>
  )
}

/** @param {{ sections: any[], dark?: boolean }} props */
export default function SeriesSections({ sections }) {
  return (
    <div className={styles.root}>
      {sections.map((section) => {
        if (section.type === 'coming_soon') return <ComingSoonSection key={section.key} section={section} />
        if (section.type === 'outlet') return <OutletSection key={section.key} section={section} />
        return <SeriesSection key={section.key} section={section} />
      })}
    </div>
  )
}
