'use client'

import { CookiePreferencesLink } from '@/components/consent/CookieConsent'
import LogoJBU from '@/components/jbu/LogoJBU'
import Image from 'next/image'
import { canOptimize } from '@/lib/artworkMedia'
import { imageVariants } from '@/lib/mediaVariants'
import OptimizedImg from '@/components/media/OptimizedImg'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Close,
  Information,
  Login,
  Logout,
  Menu,
  Moon,
  Grid,
  Sun,
  User,
  Favorite,
  ShoppingCart,
} from '@carbon/icons-react'
import SeriesSections from '@/components/home/SeriesSections'
import HeroCarousel from '@/components/home/HeroCarousel'
import HomeAuctions from '@/components/auction/HomeAuctions'
import WelcomePromoModal from '@/components/promo/WelcomePromoModal'
import styles from './Landing.module.css'
import jbu from './LandingJBU.module.css'
import { useAppTheme } from '@/components/AppThemeProvider'
import { supabase } from '@/lib/supabaseClient'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import LanguageToggle from '@/components/LanguageToggle'
import CurrencyToggle from '@/components/CurrencyToggle'
import { getArtworkCommercePresentation } from '@/lib/artworkCommerce'

function formatPrice(amount, locale) {
  if (!amount || Number.isNaN(amount)) return null
  return `$${amount.toLocaleString(locale)} MXN`
}

function ArtworkOverlay({ artwork, featured = false }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const commerce = getArtworkCommercePresentation(artwork)
  const available = commerce.availability === 'AVAILABLE'
  const price = formatPrice(commerce.price, locale)

  return (
    <div className={styles.overlay}>
      {featured ? (
        <h2 className={`${styles.heroTitle} ${jbu.heroTitle}`}>{L(artwork, 'title')}</h2>
      ) : (
        <h3 className={styles.cardTitle}>{L(artwork, 'title')}</h3>
      )}
      <p className={styles.meta}>
        {[artwork.series, L(artwork, 'medium'), artwork.dimensions, artwork.year].filter(Boolean).join(' · ')}
      </p>
      {price && (
        <p className={styles.price}>
          <span className={`${styles.dot} ${available ? styles.available : ''}`} />
          {available ? price : t('Colección privada', 'Private collection')}
        </p>
      )}
    </div>
  )
}

/**
 * @param {{ heroSlides: any[], artworks: any[], sections?: any[], siteSettings?: object|null }} props
 */
export default function LandingClient({ heroSlides = [], artworks, sections = [], siteSettings = null }) {
  const { dark, toggleTheme } = useAppTheme()
  const [session, setSession] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { t } = useI18n()
  const L = useLocalized()

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session || null)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession || null)
    })

    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  const accountName =
    session?.user?.user_metadata?.full_name ||
    session?.user?.email?.split('@')[0] ||
    ''

  async function handleSignOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <div className={`${styles.page} ${jbu.page} ${dark ? `${styles.dark} ${jbu.dark}` : ''}`}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label={t('JBU, inicio', 'JBU, home')}>
          <LogoJBU variant="current" size={22} decorative className={styles.logo} />
        </Link>
        <nav className={styles.navLinks} aria-label={t('Navegación principal', 'Main navigation')}>
          <Link href="/catalog" className={`${styles.navIcon} ${styles.navSecondary}`} aria-label={t('Catálogo', 'Catalog')} title={t('Catálogo', 'Catalog')}><Grid size={20} /></Link>
          <Link href="/como-funciona" className={`${styles.navIcon} ${styles.navSecondary}`} aria-label={t('Cómo funciona', 'How it works')} title={t('Cómo funciona', 'How it works')}><Information size={20} /></Link>
          <Link href="/collection" className={`${styles.navIcon} ${styles.navSecondary}`} aria-label={t('Guardados', 'Saved')} title={t('Guardados', 'Saved')}><Favorite size={20} /></Link>
          <Link href="/cart" className={styles.navIcon} aria-label={t('Carrito', 'Cart')} title={t('Carrito', 'Cart')}><ShoppingCart size={20} /></Link>
          {session ? (
            <>
              <Link href="/profile" className={styles.navIcon} aria-label={accountName ? `${t('Mi cuenta', 'My account')} · ${accountName}` : t('Mi cuenta', 'My account')} title={t('Mi cuenta', 'My account')}><User size={20} /></Link>
              <button type="button" onClick={handleSignOut} className={`${styles.navButton} ${styles.navIcon}`} aria-label={t('Salir', 'Sign out')} title={t('Salir', 'Sign out')}><Logout size={20} /></button>
            </>
          ) : (
            <Link href="/login" className={styles.navIcon} aria-label={t('Entrar', 'Sign in')} title={t('Entrar', 'Sign in')}><User size={20} /></Link>
          )}
          <button type="button" onClick={toggleTheme} className={`${styles.navButton} ${styles.navIcon}`} aria-label={dark ? t('Modo claro', 'Light mode') : t('Modo oscuro', 'Dark mode')} title={dark ? t('Modo claro', 'Light mode') : t('Modo oscuro', 'Dark mode')}>
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <LanguageToggle /><CurrencyToggle />
        </nav>
        <Link href="/cart" className={styles.mobileCart} aria-label={t('Carrito', 'Cart')} title={t('Carrito', 'Cart')}><ShoppingCart size={20} /></Link>
        <button
          type="button"
          className={styles.mobileMenuButton}
          aria-label={mobileMenuOpen ? t('Cerrar menú', 'Close menu') : t('Abrir menú', 'Open menu')}
          aria-expanded={mobileMenuOpen}
          aria-controls="landing-mobile-menu"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <Close size={20} /> : <Menu size={20} />}
        </button>
        <nav
          id="landing-mobile-menu"
          className={`${styles.mobileMenu} ${mobileMenuOpen ? styles.mobileMenuOpen : ''}`}
          aria-label={t('Navegación móvil', 'Mobile navigation')}
        >
          <Link href="/catalog" onClick={() => setMobileMenuOpen(false)}>
            <Grid size={20} />
            <span>{t('Catálogo', 'Catalog')}</span>
          </Link>
          <Link href="/como-funciona" onClick={() => setMobileMenuOpen(false)}>
            <Information size={20} />
            <span>{t('Cómo funciona', 'How it works')}</span>
          </Link>
          {session ? (
            <>
              <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                <User size={20} />
                <span>{t('Mi cuenta', 'My account')}</span>
              </Link>
              <button type="button" onClick={() => { setMobileMenuOpen(false); handleSignOut() }}>
                <Logout size={20} />
                <span>{t('Salir', 'Sign out')}</span>
              </button>
            </>
          ) : (
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
              <Login size={20} />
              <span>{t('Entrar', 'Sign in')}</span>
            </Link>
          )}
          <button type="button" onClick={toggleTheme}>
            {dark ? <Sun size={20} /> : <Moon size={20} />}
            <span>{dark ? t('Modo claro', 'Light mode') : t('Modo oscuro', 'Dark mode')}</span>
          </button>
          <Link href="/collection" onClick={() => setMobileMenuOpen(false)}>
            <Favorite size={20} />
            <span>{t('Guardados', 'Saved')}</span>
          </Link>
          <div className={styles.mobileLanguage}>
            <LanguageToggle /><CurrencyToggle />
          </div>
        </nav>
      </header>

      {heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />}

      <HomeAuctions />

      {sections.length > 0 && <SeriesSections sections={sections} dark={dark} />}

      {sections.length === 0 && artworks.length > 0 && (
        <section className={`${styles.featured} ${jbu.featured}`} aria-labelledby="featured-title">
          <div className={styles.sectionHead}>
            <h2 id="featured-title">{t('Destacadas', 'Featured')}</h2>
            <span className={styles.hint}>{t('Desliza →', 'Swipe →')}</span>
          </div>
          <div className={styles.scroller}>
            {artworks.map((artwork) => (
              <Link key={artwork.id} href={`/artwork/${artwork.sku}`} className={styles.card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {imageVariants(artwork.primary_image_url) ? <OptimizedImg src={artwork.primary_image_url} alt={t(`${L(artwork, 'title')}, obra original de Josué Beltrán Uresti`, `${L(artwork, 'title')}, original artwork by Josué Beltrán Uresti`)} sizes="(max-width: 640px) 80vw, 360px" variant="thumbnail" width={800} height={1000} className={styles.cardImage} /> : canOptimize(artwork.primary_image_url) ? <Image src={artwork.primary_image_url} alt={t(`${L(artwork, 'title')}, obra original de Josué Beltrán Uresti`, `${L(artwork, 'title')}, original artwork by Josué Beltrán Uresti`)} width={800} height={1000} sizes="(max-width: 640px) 80vw, 360px" quality={85} className={styles.cardImage} /> : <img src={artwork.primary_image_url} alt={t(`${L(artwork, 'title')}, obra original de Josué Beltrán Uresti`, `${L(artwork, 'title')}, original artwork by Josué Beltrán Uresti`)} loading="lazy" className={styles.cardImage} />}
                <ArtworkOverlay artwork={artwork} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={jbu.intro} aria-labelledby="intro-title">
        <p className={jbu.label}>{t('El proyecto', 'The project')}</p>
        <div>
          <h1 id="intro-title" className={jbu.introTitle}>
            {t('Josué Beltrán Uresti — artista contemporáneo y creativo en Monterrey, México', 'Josué Beltrán Uresti — Contemporary Artist & Creative in Monterrey, Mexico')}
          </h1>
          <p className={jbu.introText}>
            {t(
              'Josué Beltrán Uresti es un artista contemporáneo y creativo con base en Monterrey, México, que trabaja entre pintura, técnica mixta, resina, dibujo y objetos de arte coleccionables. Su práctica explora la abstracción a través del color, la estructura, la textura y la experimentación con materiales. Este sitio oficial reúne obra original, piezas disponibles, colecciones y su procedencia documentada.',
              'Josué Beltrán Uresti is a contemporary artist and creative based in Monterrey, Mexico, working across painting, mixed media, resin, drawing and collectible art objects. His practice explores abstraction through color, structure, texture and material experimentation. This official website presents original artworks, available works, collections and their documented provenance.'
            )}
          </p>
          <p className={jbu.introText}>
            {t(
              'Explora obra original disponible directamente con el artista, con certificado digital de autenticidad y procedencia documentada. ',
              'Explore original artworks available directly from the artist, with digital certificates of authenticity and documented provenance. '
            )}
            <Link href="/catalog" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '.25em' }}>
              {t('Ver obras disponibles', 'View available artworks')}
            </Link>
          </p>
          <p className={jbu.introText}>
            <Link href="/about" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '.25em' }}>
              {t('Conocer al artista', 'Meet the artist')}
            </Link>
          </p>
        </div>
      </section>

      <Link href="/como-funciona" className={`${styles.manifesto} ${jbu.manifesto}`}>
        <p className={jbu.label}>{t('Cómo funciona', 'How it works')}</p>
        <p className={jbu.manifestoQuote}>{t('La pintura es un lugar de espera.', 'Painting is a place of waiting.')}</p>
        <ol className={jbu.process} aria-label={t('Proceso', 'Process')}>
          {[
            ['01', t('Descubre', 'Discover')],
            ['02', t('Colecciona', 'Collect')],
            ['03', t('Autenticidad', 'Authenticity')],
            ['04', t('Conecta', 'Connect')],
          ].map(([n, label]) => (
            <li key={n}><span>{n}</span>{label}</li>
          ))}
        </ol>
        <span className={`${styles.manifestoLink} ${jbu.manifestoLink}`}>
          {t('Conoce cómo funciona', 'See how it works')}
          <ArrowRight size={16} aria-hidden />
        </span>
      </Link>

      <section className={`${styles.catalog} ${jbu.catalog}`}>
        <p className={jbu.label}>{t('Catálogo', 'Catalog')}</p>
        <Link href="/catalog" className={`${styles.catalogLink} ${jbu.catalogLink}`}>
          <span>{t('Explorar obra abstracta y técnica mixta', 'Explore abstract & mixed-media works')}</span>
          <ArrowRight size={32} aria-hidden />
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <LogoJBU variant="current" size={24} decorative className={styles.footerLogo} />
          <span className={styles.footerCopy}>© 2026 JBU · Monterrey, N.L.</span>
        </div>
        <nav className={styles.footerLinks} aria-label={t('Accesos de cuenta', 'Account links')}>
          {session ? (
            <button type="button" onClick={handleSignOut} className={styles.navButton}>
              {t('Cerrar sesión', 'Sign out')}
            </button>
          ) : (
            <Link href="/login">{t('Iniciar sesión', 'Sign in')}</Link>
          )}
          <Link href="/profile">{t('Coleccionista', 'Collector')}</Link>
          <Link href="/admin">{t('Admin', 'Admin')}</Link>
          <Link href="/info/soporte">{t('Soporte', 'Support')}</Link>
          <Link href="/info/tracking">{t('Rastrear envío', 'Track order')}</Link>
          <Link href="/terms">{t('Términos', 'Terms')}</Link>
          <Link href="/privacy">{t('Privacidad', 'Privacy')}</Link>
          <Link href="/cookies">{t('Cookies', 'Cookies')}</Link>
          <CookiePreferencesLink />
          <LanguageToggle /><CurrencyToggle />
        </nav>
      </footer>
      <WelcomePromoModal session={session} />
    </div>
  )
}
