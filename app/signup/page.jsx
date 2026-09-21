'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, PasswordInput, TextInput } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import { supabase } from '@/lib/supabaseClient'
import { authErrorMessage, safeRedirectPath } from '@/lib/authRedirect'
import styles from '../login/AuthForm.module.css'

function GoogleIcon(props) {
  return <span {...props} className={`${props.className || ''} ${styles.googleMark}`}>G</span>
}

export default function SignupPage() {
  const searchParams = useSearchParams()
  const destination = useMemo(
    () => safeRedirectPath(searchParams.get('redirect') || searchParams.get('next'), '/profile'),
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
      setStatus({ kind: 'error', title: 'No pudimos crear la cuenta', message: authErrorMessage(error) })
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
    const callback = new URL('/auth/callback', window.location.origin)
    callback.searchParams.set('next', destination)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    })
    if (error) {
      setStatus({ kind: 'error', title: 'No pudimos continuar con Google', message: authErrorMessage(error) })
      setLoading(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthShell eyebrow="Cuenta creada" title="Confirma tu correo" description="Tu colección estará lista cuando confirmes tu dirección.">
        <div className={styles.successPanel}>
          <InlineNotification kind="success" title="Te enviamos un enlace" subtitle={`Revisa ${email} y confirma tu cuenta para continuar.`} lowContrast hideCloseButton />
          <Button className={styles.fullButton} kind="secondary" size="lg" onClick={() => setAwaitingConfirmation(false)}>
            Usar otro correo
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Nueva cuenta"
      title="Crear cuenta"
      description="Vincula tus obras y consulta sus certificados desde un solo lugar."
      footer={<>¿Ya tienes cuenta? <Link href={`/login?redirect=${encodeURIComponent(destination)}`}>Iniciar sesión</Link></>}
    >
      <div className={styles.stack}>
        {status && <InlineNotification className={styles.notice} kind={status.kind} title={status.title} subtitle={status.message} lowContrast hideCloseButton />}

        <Button className={styles.fullButton} kind="secondary" size="lg" renderIcon={GoogleIcon} onClick={handleGoogleSignup} disabled={loading}>
          Continuar con Google
        </Button>
        <div className={styles.divider}>o con correo</div>

        <form className={styles.form} onSubmit={handleSignup}>
          <TextInput id="full-name" labelText="Nombre completo" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
          <TextInput id="signup-email" labelText="Correo electrónico" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nombre@correo.com" />
          <PasswordInput id="signup-password" labelText="Contraseña" helperText="Mínimo 8 caracteres" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button className={styles.fullButton} type="submit" size="lg" renderIcon={ArrowRight} disabled={loading}>
            Crear cuenta
          </Button>
          {loading && <InlineLoading description="Creando cuenta…" />}
        </form>
      </div>
    </AuthShell>
  )
}
