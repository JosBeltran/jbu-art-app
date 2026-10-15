'use client'

import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { AuctionScreen, CollectorScreen, ScreenshotScreen } from './PlatformScreens'
import styles from './ComoFunciona.module.css'

// Visuales de la plataforma real: capturas en /public/how-it-works/ y pantallas vivas en PlatformScreens.
const SCREENS = {
  discover: '/how-it-works/platform-discover.webp',
  artwork: '/how-it-works/platform-artwork.webp',
  certificate: '/how-it-works/platform-certificate.webp',
}

function Moment({ number, kicker, title, text, extra, visual, reverse }) {
  return (
    <article className={`${styles.moment} ${reverse ? styles.reverse : ''}`}>
      <div className={styles.momentText}>
        <span className={styles.stepNumber}>{number}</span>
        <p className={styles.kicker}>{kicker}</p>
        <h3 className={styles.momentTitle}>{title}</h3>
        <p className={styles.momentBody}>{text}</p>
        {extra && <p className={styles.momentExtra}>{extra}</p>}
      </div>
      <div className={styles.momentMedia}>{visual}</div>
    </article>
  )
}

export default function ComoFuncionaPage() {
  const { t } = useI18n()

  const moments = [
    {
      number: '01',
      kicker: t('Descubre', 'Discover'),
      title: t('Encuentra tu próxima obra.', 'Find your next artwork.'),
      text: t('Recorre obra original, series curadas y próximas subastas.', 'Browse original works, curated collections and upcoming auctions.'),
      visual: <ScreenshotScreen priority src={SCREENS.discover} alt={t('Catálogo JBU en móvil con una obra disponible.', 'JBU catalog on mobile showing an available artwork.')} caption={t('Catálogo', 'Catalog')} />,
    },
    {
      number: '02',
      kicker: t('Explora la obra', 'Explore the artwork'),
      title: t('Conoce cada detalle.', 'See every detail.'),
      text: t('Abre cada obra para ver imágenes, medidas, técnica, disponibilidad y detalles para coleccionar.', 'Open each work to explore images, dimensions, technique, availability and collecting details.'),
      visual: <ScreenshotScreen src={SCREENS.artwork} alt={t('Ficha de obra en móvil con imagen y ficha técnica.', 'Mobile artwork page with image and technical sheet.')} caption={t('Ficha de obra', 'Artwork page')} />,
    },
    {
      number: '03',
      kicker: t('Compra o puja', 'Buy or bid'),
      title: t('Adquiere directo o en subasta.', 'Acquire directly or at auction.'),
      text: t('Compra obras disponibles al instante o participa en las subastas en línea de JBU.', 'Acquire available works directly or participate in JBU online auctions.'),
      extra: t('Explora un evento de subasta, elige los lotes que te interesan y puja por cada obra de forma individual.', 'Explore an Auction Event, choose the Lots that interest you and bid on each work individually.'),
      visual: <AuctionScreen />,
    },
    {
      number: '04',
      kicker: t('Sigue tu colección', 'Follow your collection'),
      title: t('Todo desde tu cuenta.', 'All from your account.'),
      text: t('Inicia sesión para seguir subastas, administrar tus pujas y revisar tus compras.', 'Sign in to follow auctions, manage bids and keep track of your purchases.'),
      visual: <CollectorScreen />,
    },
    {
      number: '05',
      kicker: t('Colecciona con confianza', 'Collect with confidence'),
      title: t('Cada obra tiene su registro.', 'Every artwork has its record.'),
      text: t('Completa tu adquisición de forma segura y consulta tu certificado digital y la información de la obra desde tu cuenta.', 'Complete your acquisition securely and access your digital certificate and artwork information from your account.'),
      visual: <ScreenshotScreen src={SCREENS.certificate} alt={t('Certificado digital de autenticidad JBU en móvil.', 'JBU digital certificate of authenticity on mobile.')} caption={t('Certificado digital', 'Digital certificate')} />,
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
        <h1 className={styles.heroTitle}>{t('Descubre, puja, adquiere y administra arte original.', 'Discover, bid, acquire and manage original art.')}</h1>
        <p className={styles.heroIntro}>
          {t(
            'Del descubrimiento a la adquisición, JBU lleva la experiencia de coleccionar a línea.',
            'From discovery to acquisition, JBU brings the collecting experience online.'
          )}
        </p>
        <span className={styles.heroRule} aria-hidden />
      </header>

      <section id="proceso" className={styles.process} aria-labelledby="proceso-title">
        <div className={styles.processHead}>
          <p className={styles.label}>{t('El proceso', 'The process')}</p>
          <h2 id="proceso-title" className={styles.sectionTitle}>{t('Cinco pasos, una sola experiencia digital.', 'Five steps, one digital experience.')}</h2>
        </div>
        {moments.map((m, i) => (
          <Moment key={m.number} {...m} reverse={i % 2 === 1} />
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
