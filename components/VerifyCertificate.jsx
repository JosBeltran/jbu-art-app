'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CheckmarkOutline } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import CertificateActions from '@/components/CertificateActions'
import { isCertificateVerified } from '@/lib/certificates/status'
import LogoJBU from '@/components/jbu/LogoJBU'
import { useI18n } from '@/components/I18nProvider'
import { certificateVerifyUrl } from '@/lib/certificates/public'
import styles from '@/app/verify/[sku]/Verify.module.css'


/** Proveniencia pública derivada SOLO del certificado persistente. */
function buildProvenance(cert, t, fmt) {
  const events = []
  if (cert.year) events.push({ key: 'created', date: String(cert.year), label: t('Creada por', 'Created by'), detail: cert.artist || 'Estudio JBU' })
  events.push({ key: 'issued', date: fmt(cert.issued_at), label: t('Certificado emitido por', 'Certificate issued by'), detail: 'Estudio JBU' })
  if (cert.registered_collection) events.push({ key: 'owner', date: fmt(cert.issued_at), label: t('Registrada a', 'Registered to'), detail: t('colección privada', 'private collection') })
  return events
}

const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-4)}` : null)

/** @param {{ certificate: any, dataIntegrity?: boolean, fallback?: any }} props */
export default function VerifyCertificate({ certificate, dataIntegrity = false, fallback = null }) {
  const { t, locale } = useI18n()
  const fmt = (d) => new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
  const [pdfCheck, setPdfCheck] = useState(null)
  const cert = certificate
  const record = cert || fallback || {}
  const verified = isCertificateVerified(cert, { dataIntegrity })
  const rawImage = record.primary_image_url || record.image_url || null
  const issued = cert?.issued_at ? fmt(cert.issued_at) : null
  const artist = cert?.artist || null
  const verifyUrl = certificateVerifyUrl(record.sku)
  const edition = [cert?.edition, cert?.edition_type].filter(Boolean).join(' · ') || null
  const certNumber = cert?.certificate_number || null

  const meta = [
    { label: t('ID de obra', 'Artwork ID'), value: record.sku, mono: true },
    { label: t('Número de certificado', 'Certificate number'), value: certNumber, mono: true },
    { label: t('Artista', 'Artist'), value: artist },
    { label: t('Año de creación', 'Year of creation'), value: record.year },
    { label: t('Medio', 'Medium'), value: cert?.medium },
    { label: t('Técnica', 'Technique'), value: cert?.technique },
    { label: t('Dimensiones', 'Dimensions'), value: cert?.dimensions },
    { label: t('Edición', 'Edition'), value: edition },
    { label: t('Fecha de emisión', 'Issue date'), value: issued },
    { label: t('Versión', 'Version'), value: cert && Number(cert.version) > 1 ? String(cert.version) : null },
    { label: t('Propietario registrado', 'Registered owner'), value: cert ? (cert.registered_collection ? t('Colección privada', 'Private collection') : null) : null },
  ].filter((r) => r.value)

  const provenance = cert ? buildProvenance(cert, t, fmt) : []

  async function checkPdf() {
    setPdfCheck('loading')
    try {
      const res = await fetch(`/api/certificates/integrity?sku=${encodeURIComponent(record.sku)}`)
      const json = await res.json()
      setPdfCheck(res.ok ? (json.pdf === true ? 'ok' : json.pdf === null ? 'pending' : 'fail') : 'fail')
    } catch { setPdfCheck('fail') }
  }

  return (
    <div className={styles.page}>
      <CertificateActions sku={record.sku} canDownload={verified && cert?.has_pdf} />

      <article id="classic-certificate" className={styles.record}>
        {/* IDENTIDAD */}
        <header className={styles.identity}>
          <div className={styles.brandRow}>
            <LogoJBU variant="primary" size={30} title="Estudio JBU" />
            <span className={styles.brandText}>Estudio JBU</span>
          </div>
          <p className={styles.eyebrow}>{t('Certificado de autenticidad', 'Certificate of authenticity')}</p>
          <p className={styles.subEyebrow}>{t('Registro digital de obra', 'Digital artwork record')}</p>
        </header>

        <div className={styles.split}>
          {/* OBRA */}
          <figure className={styles.artwork}>
            <div className={styles.artworkFrame}>
              <ArtworkImage title={record.title} primaryUrl={rawImage} sku={record.sku} />
            </div>
          </figure>

          <div className={styles.info}>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>{record.title}</h1>
              <p className={styles.byline}>
                {artist}
                {record.year ? <span className={styles.year}>{artist ? ' · ' : ''}{record.year}</span> : null}
              </p>
            </div>

            {/* VERIFICACIÓN */}
            <section className={styles.seal} aria-label={t('Estado de verificación', 'Verification status')}>
              <p className={styles.sealStatus}>
                {verified && <CheckmarkOutline size={16} aria-hidden="true" />}
                {verified ? t('Certificado verificado', 'Certificate verified') : t('Certificado no emitido', 'Certificate not issued')}
              </p>
              <p className={styles.sealBy}>{verified ? t('Integridad del documento: verificada', 'Document integrity: Verified') : t('Esta obra aún no tiene un certificado de autenticidad vigente de Estudio JBU.', 'This artwork does not yet have a current Estudio JBU certificate of authenticity.')}</p>
              <dl className={styles.sealGrid}>
                {certNumber && <div><dt>{t('Certificado', 'Certificate')}</dt><dd>{certNumber}</dd></div>}
                <div><dt>{t('Obra', 'Artwork')}</dt><dd>{record.sku}</dd></div>
                {verified && cert?.data_hash && <div><dt>SHA-256</dt><dd>{shortHash(cert.data_hash)}</dd></div>}
                {issued && <div><dt>{t('Emitido', 'Issued')}</dt><dd>{issued}</dd></div>}
              </dl>
            </section>

            {/* FICHA */}
            <dl className={styles.meta}>
              {meta.map((r) => (
                <div key={r.label} className={styles.metaRow}>
                  <dt>{r.label}</dt>
                  <dd className={r.mono ? styles.mono : undefined}>{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* PROVENIENCIA */}
        {provenance.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionLabel}>{t('Proveniencia', 'Provenance')}</h2>
            <ol className={styles.timeline}>
              {provenance.map((e) => (
                <li key={e.key} className={styles.event}>
                  <span className={styles.eventDate}>{e.date}</span>
                  <span className={styles.eventText}>{e.label} <strong>{e.detail}</strong></span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* AUTENTICIDAD + EMISOR */}
        <div className={styles.twoCol}>
          <section className={styles.section}>
            <h2 className={styles.sectionLabel}>{t('Autenticidad', 'Authenticity')}</h2>
            <p className={styles.body}>
              {t(
                `Este registro digital certifica que la obra identificada es una pieza original creada por ${artist || 'Estudio JBU'} y registrada en el catálogo oficial de Estudio JBU.`,
                `This digital record certifies that the artwork identified above is an original work created by ${artist || 'Estudio JBU'} and registered in the official Estudio JBU catalog.`
              )}
            </p>
            <p className={styles.body}>
              {t(
                'El artista conserva todos los derechos de propiedad intelectual y reproducción, salvo acuerdo por escrito.',
                'The artist retains all intellectual property and reproduction rights unless otherwise agreed in writing.'
              )}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionLabel}>{t('Emitido por', 'Issued by')}</h2>
            <p className={styles.signature}>{artist || 'Estudio JBU'}</p>
            <p className={styles.bodyStrong}>{t('Artista / Estudio JBU', 'Artist / Estudio JBU')}</p>
            <dl className={styles.issuer}>
              {issued && <div><dt>{t('Fecha de emisión', 'Issue date')}</dt><dd>{issued}</dd></div>}
              {certNumber && <div><dt>{t('ID de certificado', 'Certificate ID')}</dt><dd className={styles.mono}>{certNumber}</dd></div>}
            </dl>
            {verified && (
              <details className={styles.technical}>
                <summary className={styles.hashLabel}>{t('Detalles técnicos', 'Technical details')}</summary>
                <p className={styles.hash}><span className={styles.hashLabel}>{t('Huella SHA-256 del registro', 'SHA-256 record fingerprint')}</span>{cert.data_hash}</p>
                {cert.pdf_hash && <p className={styles.hash}><span className={styles.hashLabel}>{t('Huella SHA-256 del PDF oficial', 'Official PDF SHA-256 fingerprint')}</span>{cert.pdf_hash}</p>}
                <p className={styles.small}>{cert.canonical_version || 'jbu-coa-v1'} · {t('Integridad de datos', 'Data integrity')}: {dataIntegrity ? t('verificada', 'verified') : t('no coincide', 'mismatch')}</p>
                {cert.has_pdf && (
                  <p className={styles.small}>
                    <button type="button" className={styles.linkButton} onClick={checkPdf} disabled={pdfCheck === 'loading'}>{t('Comprobar integridad del PDF', 'Check PDF integrity')}</button>
                    {pdfCheck === 'loading' && ' …'}
                    {pdfCheck === 'ok' && ` · ${t('Integridad del PDF: verificada', 'PDF integrity: Verified')}`}
                    {pdfCheck === 'fail' && ` · ${t('No fue posible confirmar el PDF', 'The PDF could not be confirmed')}`}
                    {pdfCheck === 'pending' && ` · ${t('PDF pendiente', 'PDF pending')}`}
                  </p>
                )}
              </details>
            )}
          </section>
        </div>

        {/* CUIDADOS */}
        <section className={`${styles.section} ${styles.care}`}>
          <h2 className={styles.sectionLabel}>{t('Cuidado de la obra', 'Artwork care')}</h2>
          <p className={styles.small}>
            {t(
              'Evite la luz solar directa, la humedad excesiva y los cambios bruscos de temperatura. No utilice limpiadores químicos; limpie suavemente con un paño seco y suave.',
              'Avoid direct sunlight, excessive humidity and extreme temperature changes. Do not use chemical cleaners; gently clean with a soft, dry cloth.'
            )}
          </p>
        </section>

        {/* QR */}
        <footer className={styles.verify}>
          <div className={styles.qr}>
            <QRCodeSVG value={verifyUrl} size={112} level="M" includeMargin={false} />
          </div>
          <div>
            <p className={styles.sectionLabel}>{t('Verifica esta obra', 'Verify this artwork')}</p>
            <p className={styles.body}>
              {t('Escanea el código para consultar el registro digital permanente de autenticidad.', 'Scan this code to access the permanent digital authenticity record.')}
            </p>
            <p className={styles.url}>{verifyUrl.replace(/^https:\/\//, '')}</p>
          </div>
        </footer>
      </article>
    </div>
  )
}
