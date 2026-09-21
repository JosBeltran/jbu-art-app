'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import styles from './Landing.module.css'

function formatPrice(artwork) {
  const amount = Number(artwork?.calculated_price_mxn ?? artwork?.base_price_mxn)
  if (!amount || Number.isNaN(amount)) return null
  return `$${amount.toLocaleString('es-MX')} MXN`
}

function isAvailable(artwork) {
  const status = `${artwork?.status ?? ''} ${artwork?.ownership_status ?? ''}`.toLowerCase()
  return status.includes('avail') || status.includes('disponible')
}

function ArtworkOverlay({ artwork, featured = false }) {
  const price = formatPrice(artwork)
  const available = isAvailable(artwork)

  return (
    <div className={styles.overlay}>
      {featured ? (
        <h1 className={styles.heroTitle}>{artwork.title}</h1>
      ) : (
        <h3 className={styles.cardTitle}>{artwork.title}</h3>
      )}
      <p className={styles.meta}>
        {[artwork.series, artwork.medium, artwork.dimensions, artwork.year].filter(Boolean).join(' · ')}
      </p>
      {price && (
        <p className={styles.price}>
          <span className={`${styles.dot} ${available ? styles.available : ''}`} />
          {available ? price : 'Colección privada'}
        </p>
      )}
    </div>
  )
}

/**
 * @param {{ hero: any, artworks: any[] }} props
 */
export default function LandingClient({ hero, artworks }) {
  const [dark, setDark] = useState(false)

  return (
    <div className={`${styles.page} ${dark ? styles.dark : ''}`}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="JBU, inicio">
          <span className={styles.logoFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jbu-logo.png" alt="" className={styles.logo} />
          </span>
          <span className={styles.wordmark}>JBU</span>
        </Link>
        <nav className={styles.navLinks} aria-label="Navegación principal">
          <Link href="/catalog">Obras</Link>
          <Link href="/login">Entrar</Link>
          <button type="button" onClick={() => setDark((value) => !value)} className={styles.navButton}>
            {dark ? 'Claro' : 'Oscuro'}
          </button>
        </nav>
      </header>

      {hero && (
        <Link href={`/artwork/${hero.sku}`} className={styles.hero}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hero.primary_image_url} alt={hero.title} className={styles.heroImage} />
          <p className={styles.eyebrow}>{[hero.series, hero.year].filter(Boolean).join(' · ')}</p>
          <ArtworkOverlay artwork={hero} featured />
        </Link>
      )}

      {artworks.length > 0 && (
        <section className={styles.featured} aria-labelledby="featured-title">
          <div className={styles.sectionHead}>
            <h2 id="featured-title">Obras destacadas</h2>
            <span className={styles.hint}>Desliza →</span>
          </div>
          <div className={styles.scroller}>
            {artworks.map((artwork) => (
              <Link key={artwork.id} href={`/artwork/${artwork.sku}`} className={styles.card}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artwork.primary_image_url} alt={artwork.title} loading="lazy" className={styles.cardImage} />
                <ArtworkOverlay artwork={artwork} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.catalog}>
        <Link href="/catalog" className={styles.catalogLink}>
          <span>Ver catálogo completo</span>
          <ArrowRight size={32} aria-hidden />
        </Link>
      </section>

      <section className={styles.manifesto}>
        <p>La pintura es un lugar de espera.</p>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogoFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jbu-logo.png" alt="" className={styles.footerLogo} />
          </span>
          <span className={styles.footerCopy}>© 2026 JBU · Monterrey, N.L.</span>
        </div>
        <nav className={styles.footerLinks} aria-label="Accesos de cuenta">
          <Link href="/login">Iniciar sesión</Link>
          <Link href="/profile">Coleccionista</Link>
          <Link href="/admin">Admin</Link>
        </nav>
      </footer>
    </div>
  )
}
