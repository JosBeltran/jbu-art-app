'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Modal, Toggle } from '@carbon/react'
import { Analytics } from '@vercel/analytics/react'
import { useI18n } from '@/components/I18nProvider'
import { COOKIE_KEY, cookieChoice, readCookieConsent } from '@/lib/cookieConsent'
import styles from './Consent.module.css'
// Keep the shared context typed for existing TypeScript consumers.
/** @type {import('react').Context<{consent: null | {analytics: boolean, marketing: boolean}, configure: () => void}>} */
const Context = createContext({ consent: null, configure: () => {} })
export const useCookieConsent = () => useContext(Context)
export function CookiePreferencesLink() {
  const { configure } = useCookieConsent(); const { t } = useI18n()
  return <Button kind="ghost" size="sm" className={styles.link} onClick={configure}>{t('Preferencias de cookies', 'Cookie preferences')}</Button>
}
export default function CookieConsent({ children }) {
  const { t } = useI18n()
  const [ready, setReady] = useState(false), [consent, setConsent] = useState(null)
  const [open, setOpen] = useState(false), [analytics, setAnalytics] = useState(false), [marketing, setMarketing] = useState(false), [error, setError] = useState(false)
  useEffect(() => {
    setConsent(readCookieConsent()); setReady(true)
    const sync = (event) => {
      if (event.key !== COOKIE_KEY && event.key !== null) return
      const next = readCookieConsent()
      setConsent(next)
      if (!next?.marketing && document.getElementById('tidio-chat-script')) window.location.reload()
    }
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync)
  }, [])
  function configure() { setAnalytics(consent?.analytics === true); setMarketing(consent?.marketing === true); setError(false); setOpen(true) }
  function save(a, m) {
    const next = cookieChoice(a, m)
    try { window.localStorage.setItem(COOKIE_KEY, JSON.stringify(next)) } catch { setError(true); return }
    const withdrawing = consent?.marketing === true && !next.marketing
    setConsent(next); setOpen(false); setError(false)
    // Fully unload the third-party chat after withdrawal; removing its script alone cannot stop loaded code.
    if (withdrawing) window.location.reload()
  }
  return <Context.Provider value={{ consent, configure }}>
    {children}
    {ready && consent?.analytics && <Analytics beforeSend={(event) => readCookieConsent()?.analytics === true ? event : null} />}
    {ready && !consent && !open && <section className={styles.banner} aria-label={t('Aviso de cookies', 'Cookie notice')}>
      <p>{t('Usamos cookies y tecnologías similares para que el sitio funcione correctamente, mejorar tu experiencia y, cuando corresponda, medir el uso del sitio. Puedes aceptar todas las cookies o configurar tus preferencias.', 'We use cookies and similar technologies to keep the site working, improve your experience and, where applicable, measure site usage. You can accept all cookies or configure your preferences.')} <Link href="/cookies">{t('Política de Cookies', 'Cookie Policy')}</Link></p>
      <div className={styles.actions}><Button size="sm" onClick={() => save(true, true)}>{t('ACEPTAR', 'ACCEPT')}</Button><Button size="sm" kind="secondary" onClick={configure}>{t('CONFIGURAR', 'CONFIGURE')}</Button><Button size="sm" kind="ghost" onClick={() => save(false, false)}>{t('SOLO NECESARIAS', 'NECESSARY ONLY')}</Button></div>
      {error && <p className={styles.error}>{t('No pudimos guardar tu elección. Revisa el almacenamiento del navegador.', 'We could not save your choice. Check browser storage settings.')}</p>}
    </section>}
    <Modal open={open} modalHeading={t('Preferencias de cookies', 'Cookie preferences')} primaryButtonText={t('Guardar preferencias', 'Save preferences')} secondaryButtonText={t('Solo necesarias', 'Necessary only')} onRequestSubmit={() => save(analytics, marketing)} onSecondarySubmit={() => save(false, false)} onRequestClose={() => setOpen(false)} size="sm">
      <div className={styles.category}><strong>{t('Cookies necesarias · Siempre activas', 'Necessary cookies · Always active')}</strong><p>{t('Necesarias para autenticación, seguridad, carrito, sesión y funcionamiento básico del sitio.', 'Required for authentication, security, cart, session and basic site functionality.')}</p></div>
      <div className={styles.category}><Toggle id="cookie-analytics" labelText={t('Analítica', 'Analytics')} labelA={t('Inactiva', 'Off')} labelB={t('Activa', 'On')} toggled={analytics} onToggle={setAnalytics}/><p>{t('Nos ayudan a comprender cómo se utiliza el sitio para mejorar la experiencia.', 'Help us understand site usage to improve the experience.')}</p></div>
      <div className={styles.category}><Toggle id="cookie-marketing" labelText={t('Marketing y chat opcional', 'Marketing and optional chat')} labelA={t('Inactiva', 'Off')} labelB={t('Activa', 'On')} toggled={marketing} onToggle={setMarketing}/><p>{t('Permiten medir campañas y mostrar contenido relacionado con nuestros servicios cuando estas tecnologías estén implementadas. Incluye el chat opcional Tidio; no hay píxeles publicitarios instalados.', 'Allow campaign measurement and related content when these technologies are implemented. Includes optional Tidio chat; no advertising pixels are installed.')}</p></div>
      <Link href="/cookies" target="_blank" rel="noopener noreferrer">{t('Política de Cookies', 'Cookie Policy')}</Link>
      {error && <p role="alert" className={styles.error}>{t('No pudimos guardar tu elección.', 'We could not save your choice.')}</p>}
    </Modal>
  </Context.Provider>
}
