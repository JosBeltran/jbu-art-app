'use client'

import ArtworkImage from '@/components/ArtworkImage'
import CertificateActions from '@/components/CertificateActions'
import { Tile } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/verify/[sku]/Verify.module.css'

export default function VerifyCertificate({ artwork, ownerProfile, rawImage }) {
  const { t, locale } = useI18n()

  const detailRows = [
    { label: t('Título de la Obra', 'Artwork Title'), value: artwork.title, variant: 'title' },
    {
      label: t('Técnica / Medio', 'Technique / Medium'),
      value: artwork.medium || artwork.technique || t('Técnica Mixta', 'Mixed Media'),
    },
    { label: t('Año de Creación', 'Year of Creation'), value: artwork.year || '2026' },
    { label: t('Dimensiones', 'Dimensions'), value: artwork.dimensions || 'N/A' },
    { label: t('Número de Certificado', 'Certificate Number'), value: artwork.sku, variant: 'mono' },
    {
      label: t('Propietario Registrado', 'Registered Owner'),
      value: ownerProfile ? ownerProfile.full_name : t('Estudio JBU (Disponible)', 'Estudio JBU (Available)'),
    },
  ]

  return (
    <div className={styles.page}>

      {/* ACCIONES (no se imprimen) */}
      <CertificateActions sku={artwork.sku} />

      {/* CERTIFICADO */}
      <Tile id="classic-certificate" className={styles.certificate}>
        <div id="certificate-inner" className={styles.inner}>

          {/* ENCABEZADO */}
          <header className={styles.header}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Estudio JBU" className={styles.logo} />

            <div className={styles.certTitle}>Certificate</div>
            <div className={styles.certSubtitle}>of Authenticity</div>
            <div className={styles.certKicker}>Original Artwork</div>

            <div className={styles.artistBar}>
              <div className={styles.artistName}>JOSUÉ BELTRÁN URESTI</div>
            </div>
          </header>

          {/* OBRA + DESCRIPCIÓN */}
          <div className={styles.artworkRow}>
            <div className={styles.thumb}>
              <ArtworkImage
                title={artwork.title}
                primaryUrl={rawImage}
                sku={artwork.sku}
              />
            </div>

            <div className={styles.description}>
              <p>
                {t(
                  'Este documento certifica que la obra identificada en este registro es una pieza original y auténtica creada por el artista identificado.',
                  'This document certifies that the artwork identified in this record is an original and authentic piece created by the identified artist.'
                )}
              </p>
              <p>
                {t(
                  'La pieza forma parte del catálogo oficial de Estudio JBU. El artista conserva los derechos de propiedad intelectual y reproducción de la obra.',
                  'The piece is part of the official Estudio JBU catalog. The artist retains the intellectual property and reproduction rights to the work.'
                )}
              </p>
            </div>
          </div>

          {/* INFORMACIÓN DE LA OBRA */}
          <section className={styles.details}>
            {detailRows.map(({ label, value, variant }) => (
              <div key={label} className={styles.detailRow}>
                <span className={styles.detailLabel}>{label}</span>
                <span
                  className={
                    variant === 'title'
                      ? styles.detailValueTitle
                      : variant === 'mono'
                      ? styles.detailValueMono
                      : styles.detailValue
                  }
                >
                  {value}
                </span>
              </div>
            ))}
          </section>

          {/* CONSERVACIÓN */}
          <section className={styles.care}>
            <div className={styles.careTitle}>{t('Conservación', 'Care')}</div>
            <p>
              {t(
                'Para conservar el estado óptimo de la obra, evite la exposición directa a la luz solar, humedad excesiva y fluctuaciones extremas de temperatura. No utilice limpiadores químicos. Limpie suavemente con un paño seco y suave.',
                'To keep the artwork in optimal condition, avoid direct exposure to sunlight, excessive humidity, and extreme temperature fluctuations. Do not use chemical cleaners. Gently clean with a soft, dry cloth.'
              )}
            </p>
          </section>

          {/* FIRMAS */}
          <section className={styles.signatures}>
            <div>
              <div className={styles.signatureValue}>Josué Beltrán Uresti</div>
              <div className={styles.signatureLabel}>{t('Firma del Artista', "Artist's Signature")}</div>
            </div>

            <div>
              <div className={styles.signatureDate}>
                {artwork.certificate_issued_at
                  ? new Date(artwork.certificate_issued_at).toLocaleDateString(
                      locale,
                      { year: 'numeric', month: 'short', day: 'numeric' }
                    )
                  : t('13 sep 2026', 'Sep 13, 2026')}
              </div>
              <div className={styles.signatureLabel}>{t('Fecha de Emisión', 'Issue Date')}</div>
            </div>
          </section>

          {/* HASH + IDENTIDAD */}
          <footer className={styles.footer}>
            {artwork.certificate_hash && (
              <div className={styles.hash}>
                SHA-256 · {artwork.certificate_hash}
              </div>
            )}
            <div className={styles.brand}>ESTUDIO JBU</div>
          </footer>

        </div>
      </Tile>

    </div>
  )
}
