'use client'

import LogoJBU from '@/components/jbu/LogoJBU'
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
import WelcomePromoModal from '@/components/promo/WelcomePromoModal'
import styles from './Landing.module.css'
import jbu from './LandingJBU.module.css'
import { useAppTheme } from '@/components/AppThemeProvider'
import { supabase } from '@/lib/supabaseClient'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import LanguageToggle from '@/components/LanguageToggle'

function formatPrice(artwork, locale, t) {
  const amount = Number(artwork?.calculated_price_mxn ?? artwork?.base_price_mxn)
  if (!amount || Number.isNaN(amount)) return null
  return `$${amount.toLocaleString(locale)} MXN`
}

function isAvailable(artwork) {
  const status = `${artwork?.status ?? ''} ${artwork?.ownership_status ?? ''}`.toLowerCase()
  return status.includes('avail') || status.includes('disponible')
}

function ArtworkOverlay({ artwork, featured = false }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const price = formatPrice(artwork, locale, t)
  const available = isAvailable(artwork)

  return (
    <div className={styles.overlay}>
      {featured ? (
        <h1 className={`${styles.heroTitle} ${jbu.heroTitle}`}>{L(artwork, 'title')}</h1>
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
 * @param {{ hero: any, artworks: any[] }} props
 */
export default function LandingClient({ hero, artworks }) {
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
          <LogoJBU variant="current" size={28} decorative className={styles.logo} />
        </Link>
        <nav className={styles.navLinks} aria-label={t('Navegación principal', 'Main navigation')}>
          <Link href="/catalog" className={styles.navIcon} aria-label={t('Catálogo', 'Catalog')} title={t('Catálogo', 'Catalog')}><Grid size={20} /></Link>
          <Link href="/como-funciona" className={styles.navIcon} aria-label={t('Cómo funciona', 'How it works')} title={t('Cómo funciona', 'How it works')}><Information size={20} /></Link>
          <Link href="/collection" className={styles.navIcon} aria-label={t('Guardados', 'Saved')} title={t('Guardados', 'Saved')}><Favorite size={20} /></Link>
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
          <LanguageToggle />
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
            <LanguageToggle />
          </div>
        </nav>
      </header>

      {hero && (
        <Link href={`/artwork/${hero.sku}`} className={`${styles.hero} ${jbu.hero}`}>
          <div className={styles.heroArtwork}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.primary_image_url} alt={L(hero, 'title')} className={styles.heroImage} />
          </div>
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              {t('Destacada', 'Featured')} · {[hero.series, hero.year].filter(Boolean).join(' · ')}
            </p>
            <ArtworkOverlay artwork={hero} featured />
            <span className={`${styles.heroAction} ${jbu.heroAction}`}>
              <span aria-hidden="true" /> {t('Ver', 'View')}
            </span>
          </div>
        </Link>
      )}

      {artworks.length > 0 && (
        <section className={`${styles.featured} ${jbu.featured}`} aria-labelledby="featured-title">
          <div className={styles.sectionHead}>
            <h2 id="featured-title">{t('Destacadas', 'Featured')}</h2>
            <span className={styles.hint}>{t('Desliza →', 'Swipe →')}</span>
          </div>
          <div className={styles.scroller}>
            {artworks.map((artwork) => (
              <Link key={artwork.id} href={`/artwork/${artwork.sku}`} className={styles.card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artwork.primary_image_url} alt={L(artwork, 'title')} loading="lazy" className={styles.cardImage} />
                <ArtworkOverlay artwork={artwork} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={jbu.intro} aria-labelledby="intro-title">
        <p className={jbu.label}>{t('El proyecto', 'The project')}</p>
        <div>
          <h2 id="intro-title" className={jbu.introTitle}>
            {t('Un estudio abierto: obra original, series y archivo vivo.', 'An open studio: original work, series and a living archive.')}
          </h2>
          <p className={jbu.introText}>
            {t(
              'JBU reúne la obra de Josué Beltrán Uresti —óleo, técnica mixta y relieve— desde Monterrey. Cada pieza se exhibe, se colecciona y queda registrada con su certificado de autenticidad.',
              'JBU gathers the work of Josué Beltrán Uresti —oil, mixed media and relief— from Monterrey. Every piece is exhibited, collected and recorded with its certificate of authenticity.'
            )}
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
          <span>{t('Ver catálogo', 'View catalog')}</span>
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
          <Link href="/info/terminos-de-servicio">{t('Términos', 'Terms')}</Link>
          <Link href="/info/politica-de-privacidad">{t('Privacidad', 'Privacy')}</Link>
          <LanguageToggle />
        </nav>
      </footer>
      <WelcomePromoModal session={session} />
    </div>
  )
}
