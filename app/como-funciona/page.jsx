'use client'

import Link from 'next/link'
import { ArrowRight, CheckmarkFilled, Time } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import styles from './ComoFunciona.module.css'

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

  return (
    <div className={styles.page}>
      {/* Hero con logo */}
      <section className={styles.hero}>
        <span className={styles.logoFrame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jbu-logo.png" alt={t('Logotipo de JBU', 'JBU logo')} className={styles.logo} />
        </span>
        <p className={styles.eyebrow}>JBU · {t('Galería & Certificados', 'Gallery & Certificates')}</p>
        <h1 className={styles.title}>{t('Cómo funciona', 'How it works')}</h1>
        <p className={styles.lead}>
          {t(
            'JBU es la plataforma donde la obra de Josué Beltrán Uresti se exhibe, se vende y se archiva. Este sitio es, a la vez, galería, tienda y el archivo vivo de cada pieza.',
            'JBU is the platform where Josué Beltrán Uresti’s work is exhibited, sold and archived. This site is gallery, store and the living archive of every piece at once.'
          )}
        </p>
      </section>

      {/* Beneficios de crear cuenta */}
      <section className={styles.section} aria-labelledby="benefits-title">
        <h2 id="benefits-title" className={styles.sectionTitle}>
          {t('Lo que puedes hacer con tu cuenta', 'What you can do with your account')}
        </h2>
        <p className={styles.sectionIntro}>
          {t(
            'Crear tu cuenta —o entrar con Google en un clic— habilita toda la experiencia:',
            'Creating your account —or signing in with Google in one click— unlocks the full experience:'
          )}
        </p>
        <ul className={styles.list}>
          {benefits.map((item) => (
            <li key={item} className={styles.listItem}>
              <CheckmarkFilled size={20} aria-hidden className={styles.listIcon} />
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
      </section>

      {/* Próximamente */}
      <section className={styles.section} aria-labelledby="soon-title">
        <h2 id="soon-title" className={styles.sectionTitle}>
          {t('Lo que viene', 'What’s coming')}
        </h2>
        <ul className={styles.list}>
          {comingSoon.map((item) => (
            <li key={item} className={styles.listItem}>
              <Time size={20} aria-hidden className={styles.listIconSoon} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Archivo */}
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
