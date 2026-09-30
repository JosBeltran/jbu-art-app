'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './ComoFunciona.module.css'

// Para reemplazar una ilustración basta con sustituir el archivo en /public/how-it-works/.
const ILLUSTRATIONS = {
  discover: '/how-it-works/discover.webp',
  collect: '/how-it-works/collect.webp',
  authenticity: '/how-it-works/authenticity.webp',
  connect: '/how-it-works/connect.webp',
}

function Moment({ number, kicker, title, text, src, alt, reverse, priority }) {
  const [failed, setFailed] = useState(false)
  return (
    <article className={`${styles.moment} ${reverse ? styles.reverse : ''}`}>
      <div className={styles.momentMedia}>
        <span className={`${styles.stepNumber} ${styles.stepNumberMobile}`}>{number}</span>
        <div className={styles.illustration}>
          {src && !failed ? (
            <Image
              src={src}
              alt={alt}
              fill
              sizes="(min-width: 1056px) 50vw, 100vw"
              priority={priority}
              className={styles.illustrationImg}
              onError={() => setFailed(true)}
            />
          ) : (
            <span className={styles.placeholder} role="img" aria-label={alt} />
          )}
        </div>
      </div>
      <div className={styles.momentText}>
        <span className={`${styles.stepNumber} ${styles.stepNumberDesktop}`}>{number}</span>
        <p className={styles.kicker}>{kicker}</p>
        <h3 className={styles.momentTitle}>{title}</h3>
        <p className={styles.momentBody}>{text}</p>
      </div>
    </article>
  )
}

export default function ComoFuncionaPage() {
  const { t } = useI18n()

  const moments = [
    {
      number: '01',
      kicker: t('Descubre', 'Discover'),
      title: t('Explora las obras y series.', 'Explore the artworks and series.'),
      text: t('Recorre la colección por serie, técnica y disponibilidad.', 'Browse the collection by series, technique and availability.'),
      src: ILLUSTRATIONS.discover,
      alt: t('Coleccionista explorando obras originales en una galería.', 'Collector discovering original artworks in a gallery.'),
    },
    {
      number: '02',
      kicker: t('Colecciona', 'Collect'),
      title: t('Hazla parte de tu colección.', 'Make it part of your collection.'),
      text: t('Elige una obra original, compra directamente o realiza una oferta.', 'Choose an original artwork, purchase directly or make an offer.'),
      src: ILLUSTRATIONS.collect,
      alt: t('Una mano toma una obra enmarcada para llevarla a su colección.', 'A hand takes a framed artwork into a personal collection.'),
    },
    {
      number: '03',
      kicker: t('Autenticidad', 'Authenticity'),
      title: t('Cada obra tiene su registro.', 'Every artwork has its record.'),
      text: t('Su certificado digital permanece vinculado a la obra y puede verificarse en cualquier momento.', 'Your digital certificate remains linked to the artwork and can be verified at any time.'),
      src: ILLUSTRATIONS.authenticity,
      alt: t('Obra enmarcada junto a su certificado con firma y código QR.', 'Framed artwork beside its signed certificate with a QR code.'),
    },
    {
      number: '04',
      kicker: t('Conecta', 'Connect'),
      title: t('Una colección viva.', 'A living collection.'),
      text: t('Accede a tus obras, certificados y experiencia de coleccionista desde un solo lugar.', 'Access your artworks, certificates and collector experience from one place.'),
      src: ILLUSTRATIONS.connect,
      alt: t('Coleccionista en casa consultando en su teléfono la obra que cuelga en su pared.', 'Collector at home viewing on their phone the artwork hanging on their wall.'),
    },
  ]

  const account = [
    t('Compras', 'Purchases'),
    t('Ofertas', 'Offers'),
    t('Favoritos', 'Favorites'),
    t('Seguimiento de envío', 'Shipment tracking'),
    t('Certificados', 'Certificates'),
    t('Colección', 'Collection'),
  ]

  const soon = [t('Reventa de obra', 'Artwork resale'), t('Puntos y niveles para coleccionistas', 'Collector points and levels')]

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.label}>JBU · {t('Cómo funciona', 'How it works')}</p>
        <h1 className={styles.heroTitle}>{t('De la obra a tu colección.', 'From the artwork to your collection.')}</h1>
        <p className={styles.heroIntro}>
          {t(
            'JBU reúne la galería, el estudio y el archivo de la obra de Josué Beltrán Uresti: desde el descubrimiento y la adquisición hasta su procedencia.',
            'JBU brings together the gallery, studio and archive of Josué Beltrán Uresti’s work — from discovery and acquisition to provenance.'
          )}
        </p>
        <span className={styles.heroRule} aria-hidden />
      </header>

      <section id="proceso" className={styles.process} aria-labelledby="proceso-title">
        <div className={styles.processHead}>
          <p className={styles.label}>{t('El proceso', 'The process')}</p>
          <h2 id="proceso-title" className={styles.sectionTitle}>{t('Cuatro momentos, una misma obra.', 'Four moments, one artwork.')}</h2>
        </div>
        {moments.map((m, i) => (
          <Moment key={m.number} {...m} reverse={i % 2 === 1} priority={i === 0} />
        ))}
      </section>

      <section id="cuenta" className={styles.account} aria-labelledby="cuenta-title">
        <div>
          <p className={styles.label}>{t('Tu cuenta', 'Your account')}</p>
          <h2 id="cuenta-title" className={styles.sectionTitle}>{t('Todo en un solo lugar.', 'Everything in one place.')}</h2>
          <div className={styles.actions}>
            <Link href="/signup" className={styles.primaryAction}>
              {t('Crear cuenta', 'Create account')} <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/login" className={styles.secondaryAction}>
              {t('Entrar con Google o correo', 'Sign in with Google or email')}
            </Link>
          </div>
        </div>
        <ul className={styles.accountList}>
          {account.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section id="proximamente" className={styles.soon} aria-label={t('Próximamente', 'Coming soon')}>
        <p className={styles.soonLabel}>{t('Próximamente', 'Coming soon')}</p>
        <ul>
          {soon.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className={styles.cta}>
        <p className={styles.ctaLead}>{t('¿Listo para descubrir tu próxima obra?', 'Ready to discover your next piece?')}</p>
        <Link href="/catalog" className={styles.catalogAction}>
          {t('Explora las obras', 'Explore the artworks')} <ArrowRight size={20} aria-hidden />
        </Link>
      </section>
    </div>
  )
}
