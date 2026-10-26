'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button, InlineNotification, InlineLoading } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import LegalCheckbox from '@/components/consent/LegalCheckbox'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { safeRedirectPath } from '@/lib/authRedirect'
import { hasCurrentLegalConsent } from '@/lib/legalConsent'
import styles from '../login/AuthForm.module.css'
function ConsentView() {
  const { t } = useI18n(); const params = useSearchParams()
  const next = safeRedirectPath(params.get('next'), '/profile')
  const [accepted, setAccepted] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  useEffect(() => { let active = true; async function check() {
    const { data } = await supabase.auth.getUser()
    if (!active) return
    if (!data.user) { window.location.assign(`/login?redirect=${encodeURIComponent(next)}`); return }
    const result = await supabase.rpc('get_my_legal_consent')
    if (active && !result.error && hasCurrentLegalConsent(result.data?.[0])) window.location.assign(next)
  } check(); return () => { active = false } }, [next])
  async function submit(event) {
    event.preventDefault()
    if (!accepted) { setError(t('Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para crear tu cuenta.', 'You must accept the Terms and Conditions and Privacy Notice to create your account.')); return }
    setLoading(true); setError('')
    const result = await supabase.rpc('accept_current_legal_consent')
    if (result.error || !hasCurrentLegalConsent(result.data?.[0])) { setError(t('No pudimos guardar tu aceptación. Inténtalo de nuevo.', 'We could not save your acceptance. Please try again.')); setLoading(false); return }
    window.location.assign(next)
  }
  return <AuthShell eyebrow="JBU · Estudio JBU" title={t('Antes de continuar', 'Before continuing')} description={t('Al crear tu cuenta en JBU · Estudio JBU, debes aceptar nuestros Términos y Condiciones y Aviso de Privacidad.', 'To create your account at JBU · Estudio JBU, you must accept our Terms and Conditions and Privacy Notice.')}>
    <form className={styles.form} onSubmit={submit}><LegalCheckbox accepted={accepted} onChange={setAccepted} beforeContinue />{error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}<Button type="submit" className={styles.fullButton} disabled={loading}>{t('Continuar', 'Continue')}</Button>{loading && <InlineLoading description={t('Guardando…', 'Saving…')} />}<Button kind="ghost" onClick={async () => { await supabase.auth.signOut(); window.location.assign('/login') }}>{t('Salir', 'Sign out')}</Button></form>
  </AuthShell>
}
export default function ConsentPage() { return <Suspense fallback={null}><ConsentView /></Suspense> }
