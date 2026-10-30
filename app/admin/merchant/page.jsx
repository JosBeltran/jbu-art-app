'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  Button,
  InlineLoading,
  InlineNotification,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
} from '@carbon/react'
import { Copy, Launch } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { FEED_URL, feedExclusionReason, FEED_ARTWORK_FIELDS } from '@/lib/googleMerchant'
import styles from '../artworks/[id]/edit/EditArtwork.module.css'

const REASON_LABELS = {
  DRAFT: ['Borrador', 'Draft'],
  HIDDEN: ['Oculta', 'Hidden'],
  INACTIVE_SERIES: ['Serie inactiva', 'Inactive series'],
  SOLD: ['Vendida', 'Sold'],
  PRICE_ON_REQUEST: ['Consultar precio', 'Price on request'],
  NO_PRICE: ['Sin precio', 'No price'],
  MISSING_IMAGE: ['Sin imagen', 'Missing image'],
  NO_PUBLIC_PAGE: ['Sin página pública', 'No public page'],
}

/**
 * Google Merchant Center — sección informativa del Admin.
 * Muestra la URL del feed y un diagnóstico en vivo de elegibilidad
 * calculado con las mismas reglas compartidas que usa el feed.
 */
export default function AdminMerchantPage() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(null)
  const [eligible, setEligible] = useState([])
  const [excluded, setExcluded] = useState([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: artworks, error: artworksError }, { data: seriesRows, error: seriesError }] =
        await Promise.all([
          supabase.from('artworks').select(FEED_ARTWORK_FIELDS),
          supabase.from('series').select('id, title, editorial_status, auto_launch, launch_date'),
        ])
      if (cancelled) return
      if (artworksError || seriesError || !artworks || !seriesRows) {
        const error = artworksError || seriesError
        console.error('Merchant diagnostic lookup failed:', artworksError || seriesError)
        setFailed({ section: artworksError ? 'artworks' : 'series', code: error?.code || 'NO_DATA' })
        setLoading(false)
        return
      }
      const ok = []
      const out = []
      for (const artwork of artworks) {
        const reason = feedExclusionReason(artwork, seriesRows)
        if (reason) out.push({ artwork, reason })
        else ok.push(artwork)
      }
      setEligible(ok)
      setExcluded(out)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const copyFeedUrl = async () => {
    try {
      await navigator.clipboard?.writeText(FEED_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Google Merchant Center</p>
            <h1 className={styles.title}>{t('Feed de productos', 'Product feed')}</h1>
          </div>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>{t('URL del feed', 'Feed URL')}</h2>
              <p className={styles.sectionHelp}>
                {t(
                  'Se genera dinámicamente desde las obras publicadas. Google lo lee solo; aquí no se edita nada.',
                  'Generated dynamically from published artworks. Google reads it; nothing is edited here.'
                )}
              </p>
            </div>
          </div>
          <p style={{ wordBreak: 'break-all', margin: '0 0 1rem' }}>{FEED_URL}</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button kind="primary" renderIcon={Copy} onClick={copyFeedUrl}>
              {copied ? t('Copiada', 'Copied') : t('Copiar URL', 'Copy URL')}
            </Button>
            <Button kind="tertiary" renderIcon={Launch} href={FEED_URL} target="_blank">
              {t('Abrir feed', 'Open feed')}
            </Button>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2 className={styles.sectionTitle}>{t('Elegibilidad', 'Eligibility')}</h2>
              <p className={styles.sectionHelp}>
                {t(
                  'Diagnóstico en vivo con las mismas reglas del feed y del catálogo público.',
                  'Live diagnostic using the same rules as the feed and the public catalog.'
                )}
              </p>
            </div>
          </div>
          {loading && <InlineLoading description={t('Calculando…', 'Calculating…')} />}
          {failed && (
            <InlineNotification
              kind="error"
              lowContrast
              title={t('No se pudo calcular', 'Could not compute')}
              subtitle={`${t('No se pudo leer', 'Could not read')} ${failed.section === 'artworks' ? t('obras', 'artworks') : t('series', 'series')} (${failed.code}). ${t('Vuelve a intentar.', 'Please try again.')}`}
            />
          )}
          {!loading && !failed && (
            <>
              <p>
                <Tag type="green">{t(`Productos elegibles: ${eligible.length}`, `Eligible products: ${eligible.length}`)}</Tag>{' '}
                <Tag type="red">{t(`Productos excluidos: ${excluded.length}`, `Excluded products: ${excluded.length}`)}</Tag>
              </p>
              {excluded.length > 0 && (
                <StructuredListWrapper>
                  <StructuredListHead>
                    <StructuredListRow head>
                      <StructuredListCell head>SKU</StructuredListCell>
                      <StructuredListCell head>{t('Obra', 'Artwork')}</StructuredListCell>
                      <StructuredListCell head>{t('Motivo', 'Reason')}</StructuredListCell>
                    </StructuredListRow>
                  </StructuredListHead>
                  <StructuredListBody>
                    {excluded.map(({ artwork, reason }) => {
                      const [es, en] = REASON_LABELS[reason] || [reason, reason]
                      return (
                        <StructuredListRow key={artwork.id}>
                          <StructuredListCell>{artwork.sku || '—'}</StructuredListCell>
                          <StructuredListCell>{artwork.title || '—'}</StructuredListCell>
                          <StructuredListCell>{t(es, en)}</StructuredListCell>
                        </StructuredListRow>
                      )
                    })}
                  </StructuredListBody>
                </StructuredListWrapper>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
