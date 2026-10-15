'use client'

import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { ActivityScreen, ArtworkDetailScreen, AuctionScreen, BuyScreen, CertificateScreen, DiscoverScreen, OfferScreen, OrderScreen } from './PlatformScreens'
import styles from './ComoFunciona.module.css'

// Vistas previas con datos reales de la plataforma (PlatformScreens); las ilustrativas se rotulan como tales.

function Moment({ number, kicker, title, text, extra, list, link, visual, reverse, children }) {
  return (
    <article className={`${styles.moment} ${reverse ? styles.reverse : ''}`}>
      <div className={styles.momentText}>
        <span className={styles.stepNumber}>{number}</span>
        <p className={styles.kicker}>{kicker}</p>
        <h3 className={styles.momentTitle}>{title}</h3>
        <p className={styles.momentBody}>{text}</p>
        {extra && <p className={styles.momentExtra}>{extra}</p>}
        {list && <ul className={styles.momentList}>{list.map((i) => <li key={i}>{i}</li>)}</ul>}
        {link && <Link href={link.href} className={styles.stepLink}>{link.label} <ArrowRight size={14} aria-hidden /></Link>}
      </div>
      {visual && <div className={styles.momentMedia}>{visual}</div>}
      {children}
    </article>
  )
}

export default function ComoFuncionaPage() {
  const { t } = useI18n()

  const moments = [
    {
      number: '01',
      kicker: t('Descubre', 'Discover'),
      title: t('Encuentra tu próxima obra.', 'Find your next work.'),
      text: t('Explora obra original, colecciones activas, nuevos lanzamientos y subastas en curso o próximas.', 'Explore original artworks, active collections, new releases and current or upcoming auctions.'),
      extra: t('Desde la portada, el catálogo, las colecciones y los eventos de subasta.', 'From the Home page, Catalog, Collections and Auction Events.'),
      link: { href: '/catalog', label: t('Ir al catálogo', 'Go to catalog') },
      visual: <DiscoverScreen />,
    },
    {
      number: '02',
      kicker: t('Explora la obra', 'Explore the artwork'),
      title: t('Conoce cada detalle.', 'Know every detail.'),
      text: t('Abre cada obra para consultar imágenes, medidas, técnica, disponibilidad, videos y su registro de Provenance & Evolution.', 'Open each artwork to review images, dimensions, technique, availability, videos and its Provenance & Evolution record.'),
      extra: t('También verás señales públicas de interés como vistas, favoritos e impulsos.', 'You will also see public interest signals such as views, favorites and boosts.'),
      visual: <ArtworkDetailScreen />,
    },
  ]

  const later = [
    {
      number: '04',
      kicker: t('Completa y sigue tu adquisición', 'Complete & track your acquisition'),
      title: t('La experiencia continúa después del pago.', 'Your experience continues after payment.'),
      text: t('Después de completar el pago, JBU confirma tu adquisición, genera un número de pedido y te permite seguir el pedido y la entrega desde tu espacio de coleccionista.', 'After a successful payment, JBU confirms your acquisition, creates an order number and lets you follow the order and delivery from your collector space.'),
      list: [t('Confirmación de pago por correo', 'Payment confirmation by email'), t('Número y estado del pedido', 'Order number and status'), t('Seguimiento del envío', 'Shipment tracking')],
      visual: <OrderScreen />,
    },
    {
      number: '05',
      kicker: t('Sigue tu actividad', 'Follow your activity'),
      title: t('Todo lo que haces en JBU, en un solo lugar.', 'Everything you do in JBU, in one place.'),
      text: t('Tu espacio reúne las subastas que sigues, tus pujas y subastas ganadas, tus ofertas, pedidos, favoritos e impulsos.', 'Your space brings together watched auctions, active bids and wins, your offers, orders, favorites and boosts.'),
      link: { href: '/profile', label: t('Ir a mi espacio', 'Go to my space') },
      visual: <ActivityScreen />,
    },
    {
      number: '06',
      kicker: t('Construye tu colección', 'Build your collection'),
      title: t('Tus obras y registros permanecen conectados a tu cuenta.', 'Your artworks and records stay connected to your account.'),
      text: t('Desde tu colección accedes a tus obras adquiridas, sus certificados digitales de autenticidad y tu información de coleccionista.', 'From your collection you can access acquired artworks, certificates and collector information.'),
      list: [t('Certificado digital con descarga en PDF', 'Digital certificate with PDF download'), t('Compras, subastas ganadas y ofertas', 'Purchases, auction wins and offers'), t('Nivel de coleccionista', 'Collector level')],
      link: { href: '/collection', label: t('Ver mi colección', 'View my collection') },
      visual: <CertificateScreen />,
    },
  ]

  const account = [
    t('Compras', 'Purchases'),
    t('Ofertas', 'Offers'),
    t('Favoritos', 'Favorites'),
    t('Subastas', 'Auctions'),
    t('Seguimiento de envío', 'Shipping tracking'),
    t('Certificados digitales', 'Digital certificates'),
    t('Colección', 'Collection'),
    t('Impulsos', 'Boosts'),
    t('Nivel de coleccionista', 'Collector level'),
  ]

  const soon = [t('Reventa de obra', 'Artwork resale'), t('Mercado secundario', 'Secondary marketplace'), t('Nuevos beneficios por nivel', 'Future collector-level benefits')]

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.label}>JBU · {t('Cómo funciona', 'How it works')}</p>
        <h1 className={styles.heroTitle}>{t('Descubre, explora, adquiere y administra arte original.', 'Discover, explore, acquire and manage original art.')}</h1>
        <p className={styles.heroIntro}>
          {t(
            'Del descubrimiento a la colección, JBU reúne obras, subastas, ofertas, pagos, seguimiento y certificados en una sola experiencia digital.',
            'From discovery to collection, JBU brings artworks, auctions, offers, payments, tracking and certificates into one digital experience.'
          )}
        </p>
        <span className={styles.heroRule} aria-hidden />
      </header>

      <section id="proceso" className={styles.process} aria-labelledby="proceso-title">
        <div className={styles.processHead}>
          <p className={styles.label}>{t('El proceso', 'The process')}</p>
          <h2 id="proceso-title" className={styles.sectionTitle}>{t('Seis pasos, una sola experiencia digital.', 'Six steps, one digital experience.')}</h2>
        </div>
        {moments.map((m, i) => (
          <Moment key={m.number} {...m} reverse={i % 2 === 1} />
        ))}
        <Moment
          number="03"
          kicker={t('Elige cómo adquirir', 'Choose how to acquire')}
          title={t('Compra, haz una oferta o puja.', 'Buy, make an offer or bid.')}
          text={t('Adquiere obras disponibles directamente, envía una oferta cuando esté habilitado o participa en una subasta en línea de JBU.', 'Acquire available works directly, send a private offer when enabled, or participate in a JBU online auction.')}
        >
          <div className={styles.acquireGrid} style={{ gridColumn: '1 / -1' }}>
            <div className={styles.acquireItem}>
              <h4>A · {t('Compra directa', 'Buy directly')}</h4>
              <p>{t('Las obras disponibles pueden adquirirse directamente mediante un proceso de pago seguro con Stripe.', 'Available artworks may be purchased directly through a secure Stripe payment flow.')}</p>
              <BuyScreen />
            </div>
            <div className={styles.acquireItem}>
              <h4>B · {t('Haz una oferta', 'Make an offer')}</h4>
              <p>{t('Si una obra acepta ofertas, puedes proponer un precio directamente. Las ofertas son independientes de las pujas de una subasta.', 'If offers are enabled for an artwork, you may propose a price directly. Offers are separate from auction bidding.')}</p>
              <OfferScreen />
            </div>
            <div className={styles.acquireItem}>
              <h4>C · {t('Puja en subasta', 'Bid at auction')}</h4>
              <p>{t('Explora un evento de subasta, elige los lotes que te interesan y puja por cada obra de forma individual.', 'Explore an Auction Event, choose the Lots that interest you and bid on each work independently.')}</p>
              <AuctionScreen />
            </div>
          </div>
          <p className={styles.boostNote} style={{ gridColumn: '1 / -1' }}>
            <strong>{t('Impulsos', 'Boosts')} · </strong>
            {t('Los coleccionistas también pueden impulsar obras que quieren ayudar a destacar dentro de JBU.', 'Collectors can also boost works they want to help surface within JBU.')}
          </p>
        </Moment>
        {later.map((m, i) => (
          <Moment key={m.number} {...m} reverse={i % 2 === 0} />
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
