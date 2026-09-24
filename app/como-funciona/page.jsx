'use client'

import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './ComoFunciona.module.css'
import { JBUPageHeader, JBUSection, JBUSteps } from '@/components/jbu/JBUEditorial'

export default function ComoFuncionaPage() {
  const { t } = useI18n()

  const benefits = [
    t(
      'Compra obras directamente desde la ficha de cada pieza, con pago seguro.',
      'Buy artworks directly from each piece’s page, with secure checkout.'
    ),
    t(
      'Haz una oferta por una obra y negocia su precio con la galería.',
      'Make an offer on an artwork and negotiate its price with the gallery.'
    ),
    t(
      'Marca tus obras favoritas y consúltalas en tu perfil cuando quieras.',
      'Save your favorite artworks and revisit them in your profile anytime.'
    ),
    t(
      'Da seguimiento al envío de tu compra desde tu propio pedido.',
      'Track your purchase shipment right from your order.'
    ),
    t(
      'Cada obra adquirida incluye su certificado de autenticidad digital, verificable y descargable.',
      'Every acquired artwork includes its digital certificate of authenticity, verifiable and downloadable.'
    ),
    t(
      'Tu cuenta guarda tu catálogo privado de obras adquiridas: tu colección siempre disponible.',
      'Your account keeps a private catalog of acquired artworks: your collection always available.'
    ),
  ]

  const comingSoon = [
    t(
      'Reventa de obras dentro de la plataforma: podrás poner tu pieza de nuevo a la venta.',
      'Artwork resale within the platform: you will be able to list your piece for sale again.'
    ),
    t(
      'Puntos y niveles por tus interacciones: compras, impulsos y participación.',
      'Points and levels for your interactions: purchases, boosts and participation.'
    ),
  ]

  const steps = [
    { number: '01', kicker: t('Descubre', 'Discover'), title: t('Explora las obras y series.', 'Explore the artworks and series.'), text: t('Recorre el catálogo por series, técnica y disponibilidad. Cada pieza tiene su ficha con imágenes, medidas y contexto.', 'Browse the catalog by series, technique and availability. Every piece has its own page with images, dimensions and context.') },
    { number: '02', kicker: t('Colecciona', 'Collect'), title: t('Adquiere una obra original.', 'Acquire an original artwork.'), text: t('Compra directamente con pago seguro o haz una oferta. Después sigue el envío desde tu pedido.', 'Buy directly with secure checkout or make an offer. Then track the shipment from your order.') },
    { number: '03', kicker: t('Autenticidad', 'Authenticity'), title: t('Cada obra tiene su registro.', 'Every artwork has its record.'), text: t('Cada pieza adquirida incluye un certificado de autenticidad digital, verificable y descargable, ligado a tu colección.', 'Every acquired piece includes a digital certificate of authenticity, verifiable and downloadable, linked to your collection.') },
    { number: '04', kicker: t('Conecta', 'Connect'), title: t('Un ecosistema vivo.', 'A living ecosystem.'), text: t('El proyecto conecta al artista, a los coleccionistas y a quienes siguen la obra: favoritos, impulsos y, próximamente, reventa y puntos.', 'The project connects the artist, collectors and followers of the work: favorites, boosts and, soon, resale and points.') },
  ]

  return (
    <div className={styles.page}>
      <JBUPageHeader
        label={`JBU · ${t('Cómo funciona', 'How it works')}`}
        title={t('De la obra a tu colección.', 'From the artwork to your collection.')}
        intro={t(
          'JBU es la plataforma donde la obra de Josué Beltrán Uresti se exhibe, se adquiere y se archiva: galería, estudio y archivo vivo de cada pieza.',
          'JBU is the platform where Josué Beltrán Uresti’s work is exhibited, acquired and archived: gallery, studio and living archive of every piece.'
        )}
      >
        <span className={styles.logoFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jbu-logo.png" alt={t('Logotipo de JBU', 'JBU logo')} className={styles.logo} />
        </span>
      </JBUPageHeader>

      <JBUSection id="proceso" label={t('El proceso', 'The process')} title={t('Cuatro momentos, una misma obra.', 'Four moments, one artwork.')}>
        <JBUSteps steps={steps} />
      </JBUSection>

      <JBUSection
        id="cuenta"
        label={t('Tu cuenta', 'Your account')}
        title={t('Lo que puedes hacer con tu cuenta', 'What you can do with your account')}
        intro={t('Crear tu cuenta —o entrar con Google en un clic— desbloquea la experiencia completa:', 'Creating your account —or signing in with Google in one click— unlocks the full experience:')}
      >
        <ul className={styles.list}>
          {benefits.map((item, index) => (
            <li key={item} className={styles.listItem}>
              <span className={styles.listIndex}>{String(index + 1).padStart(2, '0')}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <Link href="/signup" className={styles.primaryAction}>
            {t('Crear cuenta', 'Create account')} <ArrowRight size={16} aria-hidden />
          </Link>
          <Link href="/login" className={styles.secondaryAction}>
            {t('Entrar con Google o correo', 'Sign in with Google or email')}
          </Link>
        </div>
      </JBUSection>

      <JBUSection id="proximamente" label={t('Próximamente', 'Coming soon')} title={t('Lo que viene', 'What’s coming')}>
        <ul className={styles.list}>
          {comingSoon.map((item) => (
            <li key={item} className={`${styles.listItem} ${styles.soon}`}>
              <span className={styles.listIndex}>{t('Pronto', 'Soon')}</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </JBUSection>

      <section className={styles.manifesto}>
        <p>
          {t(
            'Cada obra que se vende aquí queda archivada con su historia, su certificado y su proveniencia. Este sitio es el archivo de la obra.',
            'Every artwork sold here is archived with its story, its certificate and its provenance. This site is the archive of the work.'
          )}
        </p>
        <Link href="/catalog" className={styles.catalogAction}>
          {t('Explorar las obras', 'Explore the artworks')} <ArrowRight size={20} aria-hidden />
        </Link>
      </section>
    </div>
  )
}
