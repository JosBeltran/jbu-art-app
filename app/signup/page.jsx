'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, PasswordInput, TextInput } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import { supabase } from '@/lib/supabaseClient'
import { authErrorMessage, rememberAuthDestination, safeRedirectPath } from '@/lib/authRedirect'
import { useI18n } from '@/components/I18nProvider'
import styles from '../login/AuthForm.module.css'
import GoogleButton from '../login/GoogleButton'
import LegalCheckbox from '@/components/consent/LegalCheckbox'
import { signupConsent } from '@/lib/legalConsent'
import consentStyles from '@/components/consent/Consent.module.css'


function SignupView() {
  const { t, lang } = useI18n()
  const searchParams = useSearchParams()
  const destination = useMemo(
    () => safeRedirectPath(searchParams.get('redirect') || searchParams.get('next'), '/collection'),
    [searchParams]
  )
  const [accepted, setAccepted] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  async function handleSignup(event) {
    event.preventDefault()
    if (!accepted) {
      setStatus({ kind: 'error', title: t('Aceptación requerida', 'Acceptance required'), message: t('Debes aceptar los Términos y Condiciones y el Aviso de Privacidad para crear tu cuenta.', 'You must accept the Terms and Conditions and Privacy Notice to create your account.') })
      return
    }
    setLoading(true)
    setStatus(null)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        data: { full_name: fullName.trim(), legal_consent: signupConsent(accepted) },
      },
    })

    if (error) {
      setStatus({ kind: 'error', title: t('No pudimos crear la cuenta', 'We could not create the account'), message: authErrorMessage(error, lang) })
      setLoading(false)
      return
    }

    if (!data.session) {
      setAwaitingConfirmation(true)
      setLoading(false)
      return
    }

    window.location.assign(destination)
  }

  async function handleGoogleSignup() {
    setLoading(true)
    setStatus(null)
    // Recordamos el destino por si el proveedor devuelve al usuario a la portada.
    rememberAuthDestination(destination)
    const callback = new URL('/auth/callback', window.location.origin)
    callback.searchParams.set('next', destination)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    })
    if (error) {
      setStatus({ kind: 'error', title: t('No pudimos continuar con Google', 'We could not continue with Google'), message: authErrorMessage(error, lang) })
      setLoading(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthShell eyebrow={t('Cuenta creada', 'Account created')} title={t('Confirma tu correo', 'Confirm your email')} description={t('Tu colección estará lista cuando confirmes tu dirección.', 'Your collection will be ready once you confirm your address.')}>
        <div className={styles.successPanel}>
          <InlineNotification kind="success" title={t('Te enviamos un enlace', 'We sent you a link')} subtitle={t(`Revisa ${email} y confirma tu cuenta para continuar.`, `Check ${email} and confirm your account to continue.`)} lowContrast hideCloseButton />
          <Button className={styles.fullButton} kind="secondary" size="lg" onClick={() => setAwaitingConfirmation(false)}>
            {t('Usar otro correo', 'Use another email')}
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow={t('Nueva cuenta', 'New account')}
      title={t('Crear cuenta', 'Create account')}
      description={t('Vincula tus obras y consulta sus certificados desde un solo lugar.', 'Link your artworks and view their certificates from one place.')}
      footer={<>{t('¿Ya tienes cuenta?', 'Already have an account?')} <Link href={`/login?redirect=${encodeURIComponent(destination)}`}>{t('Iniciar sesión', 'Sign in')}</Link></>}
    >
      <div className={styles.stack}>
        {status && <InlineNotification className={styles.notice} kind={status.kind} title={status.title} subtitle={status.message} lowContrast hideCloseButton />}

        <GoogleButton onClick={handleGoogleSignup} disabled={loading}>
          {t('Continuar con Google', 'Continue with Google')}
        </GoogleButton>
        <div className={styles.divider}>{t('o con correo', 'or with email')}</div>

        <form className={styles.form} onSubmit={handleSignup}>
          <TextInput id="full-name" labelText={t('Nombre completo', 'Full name')} autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
          <TextInput id="signup-email" labelText={t('Correo electrónico', 'Email address')} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('nombre@correo.com', 'name@email.com')} />
          <PasswordInput id="signup-password" labelText={t('Contraseña', 'Password')} helperText={t('Mínimo 8 caracteres', 'Minimum 8 characters')} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          <LegalCheckbox accepted={accepted} onChange={setAccepted} />
          <Button className={styles.fullButton} type="submit" size="lg" renderIcon={ArrowRight} disabled={loading}>
            {t('Crear cuenta', 'Create account')}
          </Button>
          {loading && <InlineLoading description={t('Creando cuenta…', 'Creating account…')} />}
        </form>
        <p className={consentStyles.note}>{t('Crear una cuenta es gratis. Utilizamos tu cuenta para gestionar compras, ofertas, subastas, certificados digitales de autenticidad y tu colección.', 'Creating an account is free. We use your account to manage purchases, offers, auctions, digital certificates of authenticity and your collection.')}</p>
      </div>
    </AuthShell>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupView />
    </Suspense>
  )
}
