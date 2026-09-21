'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from '@carbon/icons-react'
import styles from './AuthShell.module.css'

export default function AuthShell({ eyebrow, title, description, children, footer }) {
  return (
    <div className={styles.page}>
      <aside className={styles.artPanel} aria-label="Josué Beltrán Uresti">
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={16} />
          Volver a la galería
        </Link>

        <div className={styles.identity}>
          <Image
            src="/jbu-logo.png"
            alt="JBU"
            width={88}
            height={88}
            className={styles.logo}
            priority
          />
          <p className={styles.artist}>Josué Beltrán Uresti</p>
          <p className={styles.statement}>Obra, procedencia y colección privada.</p>
        </div>

        <p className={styles.copyright}>© {new Date().getFullYear()} JBU · Monterrey, N.L.</p>
      </aside>

      <section className={styles.formPanel}>
        <div className={styles.formFrame}>
          <div className={styles.mobileBrand}>
            <Link href="/" aria-label="Volver a la galería">
              <Image src="/jbu-logo.png" alt="JBU" width={48} height={48} priority />
            </Link>
          </div>
          <header className={styles.heading}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      </section>
    </div>
  )
}
