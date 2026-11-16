'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, SkeletonText } from '@carbon/react'
import { Maximize } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './CollectorGallery.module.css'

const endpoint = '/api/collector-gallery'
const photoUrl = (id, variant) => `${endpoint}?id=${id}&variant=${variant}`

function GalleryPhoto({ entry, alt, large }) {
  const { t } = useI18n()
  const [state, setState] = useState(large ? 'full' : 'thumb')
  return state === 'failed' ? (
    <span className={styles.missing}>{t('Foto no disponible', 'Photo unavailable')}</span>
  ) : (
    // Keep the response unoptimized so a CDN cannot retain withdrawn photographs.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photoUrl(entry.id, state)} alt={alt} width={entry.width} height={entry.height}
      loading={large ? 'eager' : 'lazy'} decoding="async"
      onError={() => setState(state === 'thumb' ? 'full' : 'failed')} />
  )
}

export default function CollectorGallery() {
  const { t } = useI18n()
  const [entries, setEntries] = useState(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState(null)
  const dialog = useRef(null)
  const opener = useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : [])
      .then(rows => {
        setEntries(rows)
        setHasMore(rows.length === 24)
      })
      .catch(() => { if (!controller.signal.aborted) setEntries([]) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (selected && !dialog.current.open) dialog.current.showModal()
  }, [selected])
  async function loadMore() {
    setFetching(true)
    setLoadError(false)
    try {
      const next = page + 1
      const response = await fetch(endpoint + '?page=' + next, { cache: 'no-store' })
      if (!response.ok) throw new Error('gallery_unavailable')
      const rows = await response.json()
      setEntries(current => [...current, ...rows.filter(row => !current.some(item => item.id === row.id))])
      setHasMore(rows.length === 24)
      setPage(next)
    } catch {
      setLoadError(true)
    } finally {
      setFetching(false)
    }
  }
  if (entries?.length === 0) return null
  const heading = t('Obras en su nuevo espacio', 'Artworks in Their New Spaces')
  const caption = entry => t(entry.caption_es || entry.caption_en, entry.caption_en || entry.caption_es)
  const category = entry => ({
    private: t('Colección privada', 'Private Collection'),
    studio: t('Estudio', 'Studio'),
    public: t('Espacio público', 'Public Space'),
  })[entry.category]
  return (
    <section className={styles.section} aria-labelledby="collector-gallery-heading">
      <h2 id="collector-gallery-heading">{heading}</h2>
      {entries === null ? <div role="status" aria-label={t('Cargando fotos', 'Loading photos')}><SkeletonText paragraph lineCount={2} /></div> : (
        <div className={styles.grid}>
          {entries.map(entry => (
            <figure key={entry.id} className={entry.featured ? styles.featured : undefined}>
              <button type="button" className={styles.photoButton} onClick={event => {
                opener.current = event.currentTarget
                setSelected(entry)
              }} aria-label={t('Ampliar foto', 'Enlarge photo') + ' · ' + (caption(entry) || category(entry))}>
                <GalleryPhoto entry={entry} alt={caption(entry) || category(entry)} />
                <span className={styles.expand}><Maximize aria-hidden size={20} /></span>
              </button>
              <figcaption><span>{category(entry)}</span>{caption(entry) && <p>{caption(entry)}</p>}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {hasMore && <Button kind="ghost" disabled={fetching} onClick={loadMore}>
        {fetching ? t('Cargando fotos…', 'Loading photos…') : t('Ver más fotos', 'See more photos')}
      </Button>}
      {loadError && <p role="alert">{t('No se pudieron cargar más fotos. Intenta nuevamente.', 'Could not load more photos. Try again.')}</p>}
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="gallery-photo-title" onClose={() => {
        setSelected(null)
        opener.current?.focus()
      }}>
        {selected && <>
          <div className={styles.dialogHeader}>
            <h3 id="gallery-photo-title">{caption(selected) || category(selected)}</h3>
            <Button kind="ghost" size="sm" onClick={() => dialog.current.close()}>{t('Cerrar', 'Close')}</Button>
          </div>
          <GalleryPhoto key={selected.id} entry={selected} alt={caption(selected) || category(selected)} large />
        </>}
      </dialog>
    </section>
  )
}
