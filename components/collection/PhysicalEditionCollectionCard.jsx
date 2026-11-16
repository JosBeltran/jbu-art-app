'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, InlineNotification, Tag } from '@carbon/react'
import { ArrowRight, Certificate, Download, QrCode } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import PhysicalEditionClaimButton from '@/components/certificates/PhysicalEditionClaimButton'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { numberPhysicalEdition } from '@/lib/physicalEdition'
import styles from '@/app/(account)/collection/Collection.module.css'

export default function PhysicalEditionCollectionCard({ unit, delivery, readOnly }) {
  const { t } = useI18n()
  const localized = useLocalized()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const title = localized(unit, 'title')
  const verify = unit.certificate_sku ? `/verify/${encodeURIComponent(unit.certificate_sku)}` : null

  async function download() {
    setDownloading(true)
    setDownloadError(false)
    try {
      const result = await fetch(`/api/certificates/download?sku=${encodeURIComponent(unit.certificate_sku)}`,
        { headers: await authHeaders(), cache: 'no-store' })
      if (!result.ok) throw new Error('certificate_download_failed')
      const { url } = await result.json()
      if (!url) throw new Error('certificate_download_failed')
      window.location.assign(url)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <article className={styles.artwork}>
      <Link href={`/artwork/${encodeURIComponent(unit.sku)}`} className={styles.imageWrap}>
        <ArtworkImage title={title} primaryUrl={unit.primary_image_url} sku={unit.sku} className={styles.image}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <Tag className={styles.status} type="purple" size="sm">{numberPhysicalEdition(unit.edition_number, unit.edition_size)}</Tag>
      </Link>
      <div className={styles.artworkBody}>
        <div>
          <h2 className={styles.artworkTitle}>{title}</h2>
          <p className={styles.medium}>{[unit.artist, localized(unit, 'medium'), unit.dimensions].filter(Boolean).join(' · ')}</p>
        </div>
        <dl className={styles.registryData}>
          <div><dt>{t('Identificador del ejemplar', 'Unit identifier')}</dt><dd>{unit.unit_identifier}</dd></div>
          <div><dt>{t('Pedido y entrega', 'Order and delivery')}</dt><dd><Tag type={delivery.type} size="sm">{delivery.label}</Tag></dd></div>
          <div><dt>{t('Certificado de autenticidad', 'Certificate of Authenticity')}</dt>
            <dd>{verify ? t('Emitido', 'Issued') : t('Pendiente de emisión', 'Pending issuance')}</dd></div>
        </dl>
        {verify ? <>
          <Button as={Link} href={verify} kind="ghost" size="sm" renderIcon={QrCode}>
            {t('Ver certificado, registro y verificación QR', 'View certificate, ownership record and QR verification')}
          </Button>
          {!readOnly && unit.pdf_ready && <Button kind="ghost" size="sm" disabled={downloading} renderIcon={Download} onClick={download}>
            {downloading ? t('Preparando PDF…', 'Preparing PDF…') : t('Descargar certificado PDF', 'Download certificate PDF')}
          </Button>}
          {!readOnly && !unit.pdf_ready && <PhysicalEditionClaimButton orderItemId={unit.order_item_id} isDelivered={unit.order_status === 'DELIVERED'} pdfPending />}
        </> : !readOnly ? <PhysicalEditionClaimButton orderItemId={unit.order_item_id} isDelivered={unit.order_status === 'DELIVERED'} />
          : <p><Certificate size={16} aria-hidden="true" /> {t('Certificado pendiente', 'Certificate pending')}</p>}
        {!readOnly && <Button as={Link} href={`/orders/${unit.order_id}`} kind="tertiary" size="sm" renderIcon={ArrowRight}>
          {t('Ver pedido', 'View order')}
        </Button>}
        {downloadError && <InlineNotification kind="error" hideCloseButton title={t('No se pudo descargar el certificado. Intenta de nuevo.', 'Certificate download failed. Try again.')} />}
      </div>
    </article>
  )
}
