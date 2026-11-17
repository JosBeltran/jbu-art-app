'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, SkeletonPlaceholder } from '@carbon/react'
import { ArrowLeft, ArrowRight, Maximize } from '@carbon/icons-react'
import { JBUPageHeader } from '@/components/jbu/JBUEditorial'
import LanguageToggle from '@/components/LanguageToggle'
import { useI18n } from '@/components/I18nProvider'
import styles from './CollectorGallery.module.css'

const endpoint = '/api/collector-gallery'
const pageSize = 24

async function fetchGalleryPage(page, signal) {
  const response = await fetch(`${endpoint}?page=${page}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('gallery_unavailable')
  return response.json()
}

function GalleryPhoto({ entry, alt, large = false }) {
  const { t } = useI18n()
  const preferred = large ? 'full' : 'thumb'
  const fallback = large ? 'thumb' : 'full'
  const [variant, setVariant] = useState(preferred)
  if (variant === 'failed') {
    return <span className={styles.missing} role="status">{t('Foto no disponible', 'Photo unavailable')}</span>
  }

  // Keep the existing authorized media URL and bypass the Next.js image cache.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${endpoint}?id=${entry.id}&variant=${variant}`} alt={alt}
    width={entry.width} height={entry.height} loading={large ? 'eager' : 'lazy'} decoding="async"
    onError={() => setVariant(variant === preferred ? fallback : 'failed')} />
}

export default function CollectorGallery() {
  const { t } = useI18n()
  const [entries, setEntries] = useState(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(null)
  const dialog = useRef(null)
  const opener = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchGalleryPage(0, controller.signal)
      .then(rows => {
        if (controller.signal.aborted) return
        setEntries(rows)
        setHasMore(rows.length === pageSize)
      })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true) })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    if (selectedIndex !== null && dialog.current && !dialog.current.open) {
      dialog.current.showModal()
    }
  }, [selectedIndex])

  async function loadMore() {
    setFetching(true)
    setLoadError(false)
    try {
      const rows = await fetchGalleryPage(page + 1)
      setEntries(current => [...current, ...rows.filter(row => !current.some(item => item.id === row.id))])
      setHasMore(rows.length === pageSize)
      setPage(page + 1)
    } catch {
      setLoadError(true)
    } finally {
      setFetching(false)
    }
  }

  const selected = selectedIndex === null ? null : entries[selectedIndex]
  const caption = entry => t(entry.caption_es || entry.caption_en, entry.caption_en || entry.caption_es)
  const category = entry => ({
    private: t('Colección privada', 'Private Collection'),
    studio: t('Estudio', 'Studio'),
    public: t('Espacio público', 'Public Space'),
  })[entry.category] || t('Fotografía compartida', 'Shared Photograph')

  function movePhoto(offset) {
    setSelectedIndex(index => Math.max(0, Math.min(index + offset, entries.length - 1)))
  }

  return (
    <div className={styles.galleryPage}>
      <JBUPageHeader
        label={t('JBU · Coleccionistas', 'JBU · Collectors')}
        title={t('Obras en su nuevo espacio', 'Art in Their New Home')}
        intro={t(
          'Una obra de arte adquiere nuevos significados cuando encuentra su lugar en la vida de alguien.',
          "An artwork takes on new meaning when it finds its place in someone's life."
        )}
      />

      <section className={styles.section} aria-label={t('Fotografías compartidas por clientes', 'Photographs shared by customers')}>
        <div className={styles.introduction}>
          <p>{t(
            'Esta galería reúne fotografías auténticas que nuestros clientes han compartido con nosotros. Son pequeños testimonios de cómo las obras de JBU conviven con diferentes espacios, estilos y formas de vivir el arte.',
            'This gallery brings together authentic photographs shared with us by our customers. Each image offers a glimpse of how JBU artworks become part of different spaces, personal styles, and ways of living with art.'
          )}</p>
          <LanguageToggle className={styles.language} />
        </div>

        {entries === null && !loadError && (
          <div className={styles.grid} role="status" aria-label={t('Cargando fotos', 'Loading photos')}>
            {[0, 1, 2].map(item => <SkeletonPlaceholder className={styles.skeleton} key={item} />)}
          </div>
        )}
        {entries?.length === 0 && <p className={styles.notice}>{t('Aún no hay fotografías publicadas.', 'No photographs have been published yet.')}</p>}
        {entries?.length > 0 && (
          <div className={styles.grid}>
            {entries.map((entry, index) => {
              const title = category(entry)
              const description = caption(entry)
              return (
                <figure key={entry.id} className={entry.featured ? styles.featured : undefined}>
                  <button type="button" className={styles.photoButton} onClick={event => {
                    opener.current = event.currentTarget
                    setSelectedIndex(index)
                  }} aria-label={t('Ampliar foto', 'Enlarge photo') + ' · ' + (description || title)}>
                    <GalleryPhoto entry={entry} alt="" />
                    <span className={styles.expand}><Maximize aria-hidden size={20} /></span>
                  </button>
                  <figcaption>
                    <h2>{title}</h2>
                    {description && <p>{description}</p>}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        )}
        {loadError && (
          <p className={styles.notice} role="alert">{t('No se pudieron cargar las fotografías. Intenta de nuevo.', 'The photographs could not be loaded. Please try again.')}</p>
        )}
        {entries === null && loadError && <Button kind="tertiary" onClick={() => {
          setLoadError(false)
          setRetry(value => value + 1)
        }}>{t('Reintentar', 'Try again')}</Button>}
        {hasMore && (
          <div className={styles.more}>
            <Button kind="tertiary" disabled={fetching} onClick={loadMore}>
              {fetching ? t('Cargando fotos…', 'Loading photos…') : t('Ver más fotos', 'See more photos')}
            </Button>
          </div>
        )}
      </section>

      <dialog ref={dialog} className={styles.dialog} aria-labelledby="collector-photo-title" onClose={() => {
        setSelectedIndex(null)
        opener.current?.focus()
      }} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        movePhoto(event.key === 'ArrowLeft' ? -1 : 1)
      }}>
        {selected && <>
          <div className={styles.dialogHeader}>
            <h2 id="collector-photo-title">{category(selected)}</h2>
            <Button kind="ghost" size="sm" onClick={() => dialog.current.close()}>{t('Cerrar', 'Close')}</Button>
          </div>
          <div className={styles.dialogPhoto}>
            <GalleryPhoto key={selected.id} entry={selected} alt={caption(selected) || category(selected)} large />
          </div>
          <div className={styles.dialogFooter}>
            {caption(selected) && <p className={styles.dialogCaption}>{caption(selected)}</p>}
            {entries.length > 1 && <div className={styles.photoControls}>
              <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowLeft}
                iconDescription={t('Foto anterior', 'Previous photo')} tooltipPosition="top"
                aria-disabled={selectedIndex === 0} onClick={() => movePhoto(-1)} />
              <p className={styles.counter} aria-live="polite">{t(
                `Foto ${selectedIndex + 1} de ${entries.length}`,
                `Photo ${selectedIndex + 1} of ${entries.length}`
              )}</p>
              <Button kind="ghost" size="sm" hasIconOnly renderIcon={ArrowRight}
                iconDescription={t('Foto siguiente', 'Next photo')} tooltipPosition="top"
                aria-disabled={selectedIndex === entries.length - 1} onClick={() => movePhoto(1)} />
            </div>}
          </div>
        </>}
      </dialog>
    </div>
  )
}
