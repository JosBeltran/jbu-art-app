'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import styles from './Landing.module.css'
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
        <h1 className={styles.heroTitle}>{L(artwork, 'title')}</h1>
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
    <div className={`${styles.page} ${dark ? styles.dark : ''}`}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label={t('JBU, inicio', 'JBU, home')}>
          <span className={styles.logoFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jbu-logo.png" alt="" className={styles.logo} />
          </span>
          <span className={styles.wordmark}>JBU</span>
        </Link>
        <nav className={styles.navLinks} aria-label={t('Navegación principal', 'Main navigation')}>
          <Link href="/catalog">{t('Obras', 'Artworks')}</Link>
          {session ? (
            <>
              <Link href="/profile">{accountName ? `${t('Mi cuenta', 'My account')} · ${accountName}` : t('Mi cuenta', 'My account')}</Link>
              <button type="button" onClick={handleSignOut} className={styles.navButton}>
                {t('Salir', 'Sign out')}
              </button>
            </>
          ) : (
            <Link href="/login">{t('Entrar', 'Sign in')}</Link>
          )}
          <button type="button" onClick={toggleTheme} className={styles.navButton}>
            {dark ? t('Claro', 'Light') : t('Oscuro', 'Dark')}
          </button>
          <LanguageToggle />
        </nav>
      </header>

      {hero && (
        <Link href={`/artwork/${hero.sku}`} className={styles.hero}>
          <div className={styles.heroArtwork}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.primary_image_url} alt={L(hero, 'title')} className={styles.heroImage} />
          </div>
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              {t('Obra destacada', 'Featured artwork')} · {[hero.series, hero.year].filter(Boolean).join(' · ')}
            </p>
            <ArtworkOverlay artwork={hero} featured />
            <span className={styles.heroAction}>
              <span aria-hidden="true" /> {t('Ver obra', 'View artwork')}
            </span>
          </div>
        </Link>
      )}

      {artworks.length > 0 && (
        <section className={styles.featured} aria-labelledby="featured-title">
          <div className={styles.sectionHead}>
            <h2 id="featured-title">{t('Obras destacadas', 'Featured artworks')}</h2>
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

      <section className={styles.catalog}>
        <Link href="/catalog" className={styles.catalogLink}>
          <span>{t('Ver catálogo completo', 'View full catalog')}</span>
          <ArrowRight size={32} aria-hidden />
        </Link>
      </section>

      <Link href="/como-funciona" className={styles.manifesto}>
        <p>{t('La pintura es un lugar de espera.', 'Painting is a place of waiting.')}</p>
        <span className={styles.manifestoLink}>
          {t('Conoce cómo funciona', 'See how it works')}
          <ArrowRight size={16} aria-hidden />
        </span>
      </Link>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogoFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jbu-logo.png" alt="" className={styles.footerLogo} />
          </span>
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
          <LanguageToggle />
        </nav>
      </footer>
    </div>
  )
}
