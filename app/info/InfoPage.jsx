'use client'

import Link from 'next/link'
import { ArrowLeft, ArrowRight } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { JBUPageHeader, JBUSection } from '@/components/jbu/JBUEditorial'
import styles from './InfoPage.module.css'

/** Texto bilingüe: [es, en] */
export function useBi() {
  const { t } = useI18n()
  return (pair) => (Array.isArray(pair) ? t(pair[0], pair[1]) : pair)
}

export const INFO_LINKS = [
  { href: '/info/soporte', label: ['Soporte', 'Support'] },
  { href: '/info/tracking', label: ['Rastrear envío', 'Track order'] },
  { href: '/info/art-objects', label: ['Art Objects', 'Art Objects'] },
  { href: '/info/terminos-de-servicio', label: ['Términos', 'Terms'] },
  { href: '/info/politica-de-privacidad', label: ['Privacidad', 'Privacy'] },
]

export function InfoNav() {
  const b = useBi()
  return (
    <nav className={styles.infoNav} aria-label={b(['Información', 'Information'])}>
      {INFO_LINKS.map((l) => <Link key={l.href} href={l.href}>{b(l.label)}</Link>)}
    </nav>
  )
}

export function InfoShell({ label, title, intro, updated, children }) {
  const b = useBi()
  return (
    <div className={styles.page}>
      <div className={styles.back}>
        <Link href="/catalog"><ArrowLeft size={16} aria-hidden /> {b(['Volver', 'Back'])}</Link>
      </div>
      <JBUPageHeader label={b(label)} title={b(title)} intro={intro ? b(intro) : undefined} />
      {updated && <p className={styles.updated}>{b(updated)}</p>}
      {children}
      <footer className={styles.footer}><InfoNav /></footer>
    </div>
  )
}

/** sections: [{ label, title, paragraphs?: [pair], items?: [[labelPair, textPair]] }] */
export function InfoSections({ sections }) {
  const b = useBi()
  return sections.map((s, i) => (
    <JBUSection key={i} id={`s${i + 1}`} label={b(s.label ?? [String(i + 1).padStart(2, '0'), String(i + 1).padStart(2, '0')])} title={b(s.title)}>
      <div className={styles.body}>
        {s.paragraphs?.map((p, j) => <p key={j}>{b(p)}</p>)}
        {s.items && (
          <ul className={styles.list}>
            {s.items.map(([k, v], j) => (
              <li key={j} className={styles.listItem}>
                <span className={styles.listKey}>{b(k)}</span>
                <span>{typeof v === 'object' && !Array.isArray(v) ? v : b(v)}</span>
              </li>
            ))}
          </ul>
        )}
        {s.action && (
          <a href={s.action.href} className={styles.action} target={s.action.external ? '_blank' : undefined} rel={s.action.external ? 'noreferrer' : undefined}>
            {b(s.action.label)} <ArrowRight size={16} aria-hidden />
          </a>
        )}
      </div>
    </JBUSection>
  ))
}
