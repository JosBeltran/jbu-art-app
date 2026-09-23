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

function GoogleIcon(props) {
  return <span {...props} className={`${props.className || ''} ${styles.googleMark}`}>G</span>
}

function SignupView() {
  const { t, lang } = useI18n()
  const searchParams = useSearchParams()
  const destination = useMemo(
    () => safeRedirectPath(searchParams.get('redirect') || searchParams.get('next'), '/collection'),
    [searchParams]
  )
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  async function handleSignup(event) {
    event.preventDefault()
    setLoading(true)
    setStatus(null)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        data: { full_name: fullName.trim() },
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

        <Button className={styles.fullButton} kind="secondary" size="lg" renderIcon={GoogleIcon} onClick={handleGoogleSignup} disabled={loading}>
          {t('Continuar con Google', 'Continue with Google')}
        </Button>
        <div className={styles.divider}>{t('o con correo', 'or with email')}</div>

        <form className={styles.form} onSubmit={handleSignup}>
          <TextInput id="full-name" labelText={t('Nombre completo', 'Full name')} autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
          <TextInput id="signup-email" labelText={t('Correo electrónico', 'Email address')} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('nombre@correo.com', 'name@email.com')} />
          <PasswordInput id="signup-password" labelText={t('Contraseña', 'Password')} helperText={t('Mínimo 8 caracteres', 'Minimum 8 characters')} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button className={styles.fullButton} type="submit" size="lg" renderIcon={ArrowRight} disabled={loading}>
            {t('Crear cuenta', 'Create account')}
          </Button>
          {loading && <InlineLoading description={t('Creando cuenta…', 'Creating account…')} />}
        </form>
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
