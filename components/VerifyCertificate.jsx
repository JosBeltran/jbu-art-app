'use client'

import { QRCodeSVG } from 'qrcode.react'
import { CheckmarkOutline } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import CertificateActions from '@/components/CertificateActions'
import LogoJBU from '@/components/jbu/LogoJBU'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/verify/[sku]/Verify.module.css'

const ARTIST = 'Josué Beltrán Uresti'
const SITE = 'josuebeltranuresti.com'

/**
 * Eventos de proveniencia derivados SOLO de registros existentes.
 * Preparado para recibir en el futuro transferencias, exposiciones,
 * reventas o restauraciones (mismo formato: { key, date, label, detail }).
 */
function buildProvenance(artwork, ownerProfile, t, fmt) {
  const events = []
  if (artwork.year) {
    events.push({ key: 'created', date: String(artwork.year), label: t('Creada por', 'Created by'), detail: artwork.artist || ARTIST })
  }
  if (artwork.certificate_issued_at) {
    events.push({ key: 'issued', date: fmt(artwork.certificate_issued_at), label: t('Certificado emitido por', 'Certificate issued by'), detail: 'Estudio JBU' })
  }
  if (ownerProfile?.full_name) {
    const when = artwork.claimed_at || artwork.ownership_verified_at || artwork.certificate_issued_at
    events.push({ key: 'owner', date: when ? fmt(when) : '—', label: t('Registrada a su coleccionista', 'Registered to collector'), detail: ownerProfile.full_name })
  }
  return events
}

export default function VerifyCertificate({ artwork, ownerProfile, rawImage }) {
  const { t, locale } = useI18n()

  const fmt = (d) => new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
  const issued = artwork.certificate_issued_at ? fmt(artwork.certificate_issued_at) : null
  const verified = !artwork.ownership_status || artwork.ownership_status === 'VERIFIED' || Boolean(artwork.certificate_issued_at)
  const artist = artwork.artist || ARTIST
  const verifyUrl = `https://${SITE}/verify/${encodeURIComponent(artwork.sku)}`
  const edition = artwork.edition || artwork.edition_type || null

  const meta = [
    { label: t('ID de obra', 'Artwork ID'), value: artwork.sku, mono: true },
    { label: t('Número de certificado', 'Certificate number'), value: artwork.certificate_number || `COA-${artwork.sku}`, mono: true },
    { label: t('Artista', 'Artist'), value: artist },
    { label: t('Año de creación', 'Year of creation'), value: artwork.year },
    { label: t('Técnica / Medio', 'Technique / Medium'), value: artwork.medium || artwork.technique },
    { label: t('Dimensiones', 'Dimensions'), value: artwork.dimensions },
    { label: t('Edición', 'Edition'), value: edition },
    { label: t('Fecha de emisión', 'Issue date'), value: issued },
    { label: t('Propietario registrado', 'Registered owner'), value: ownerProfile?.full_name || t('Estudio JBU (disponible)', 'Estudio JBU (available)') },
  ].filter((r) => r.value)

  const provenance = buildProvenance(artwork, ownerProfile, t, fmt)

  return (
    <div className={styles.page}>
      <CertificateActions sku={artwork.sku} />

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
              <ArtworkImage title={artwork.title} primaryUrl={rawImage} sku={artwork.sku} />
            </div>
          </figure>

          <div className={styles.info}>
            <div className={styles.titleBlock}>
              <h1 className={styles.title}>{artwork.title}</h1>
              <p className={styles.byline}>
                {artist}
                {artwork.year ? <span className={styles.year}> · {artwork.year}</span> : null}
              </p>
            </div>

            {/* VERIFICACIÓN */}
            <section className={styles.seal} aria-label={t('Estado de verificación', 'Verification status')}>
              <p className={styles.sealStatus}>
                <CheckmarkOutline size={16} aria-hidden="true" />
                {verified ? t('Registro auténtico', 'Authentic record') : t('Registro en revisión', 'Record under review')}
              </p>
              <p className={styles.sealBy}>{t('Verificado por Estudio JBU', 'Verified by Estudio JBU')}</p>
              <dl className={styles.sealGrid}>
                <div><dt>{t('Certificado', 'Certificate')}</dt><dd>{artwork.certificate_number || `COA-${artwork.sku}`}</dd></div>
                <div><dt>{t('Obra', 'Artwork')}</dt><dd>{artwork.sku}</dd></div>
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
                `Este registro digital certifica que la obra identificada es una pieza original creada por ${artist} y registrada en el catálogo oficial de Estudio JBU.`,
                `This digital record certifies that the artwork identified above is an original work created by ${artist} and registered in the official Estudio JBU catalog.`
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
            <p className={styles.signature}>{ARTIST}</p>
            <p className={styles.bodyStrong}>{t('Artista / Estudio JBU', 'Artist / Estudio JBU')}</p>
            <dl className={styles.issuer}>
              {issued && <div><dt>{t('Fecha de emisión', 'Issue date')}</dt><dd>{issued}</dd></div>}
              <div><dt>{t('ID de certificado', 'Certificate ID')}</dt><dd className={styles.mono}>{artwork.certificate_number || `COA-${artwork.sku}`}</dd></div>
            </dl>
            {artwork.certificate_hash && (
              <p className={styles.hash}>SHA-256 · {artwork.certificate_hash}</p>
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
            <p className={styles.url}>{SITE}/verify/{artwork.sku}</p>
          </div>
        </footer>
      </article>
    </div>
  )
}
