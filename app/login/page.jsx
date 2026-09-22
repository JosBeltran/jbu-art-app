'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, PasswordInput, TextInput } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import { supabase } from '@/lib/supabaseClient'
import { authErrorMessage, rememberAuthDestination, safeRedirectPath } from '@/lib/authRedirect'
import styles from './AuthForm.module.css'

function GoogleIcon(props) {
  return <span {...props} className={`${props.className || ''} ${styles.googleMark}`}>G</span>
}

function LoginView() {
  const searchParams = useSearchParams()
  const requestedDestination = useMemo(
    () => safeRedirectPath(searchParams.get('redirect') || searchParams.get('next'), ''),
    [searchParams]
  )
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  async function destinationFor(user) {
    if (requestedDestination) return requestedDestination

    const [profileResult, userResult] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('users').select('role').eq('id', user.id).maybeSingle(),
    ])
    const role = String(profileResult.data?.role || userResult.data?.role || '').toUpperCase()
    const adminEmails = String(process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
    const isAdmin =
      role === 'ADMIN' ||
      role === 'ADMINISTRADOR' ||
      adminEmails.includes(String(user.email || '').toLowerCase())
    return isAdmin ? '/admin' : '/profile'
  }

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setStatus(null)

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error || !data.user) {
      setStatus({ kind: 'error', title: 'No pudimos iniciar sesión', message: authErrorMessage(error) })
      setLoading(false)
      return
    }

    window.location.assign(await destinationFor(data.user))
  }

  async function handleGoogleLogin() {
    setLoading(true)
    setStatus(null)
    const next = requestedDestination || '/profile'
    // Recordamos el destino por si el proveedor devuelve al usuario a la portada.
    rememberAuthDestination(next)
    const callback = new URL('/auth/callback', window.location.origin)
    callback.searchParams.set('next', next)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    })
    if (error) {
      setStatus({ kind: 'error', title: 'No pudimos continuar con Google', message: authErrorMessage(error) })
      setLoading(false)
    }
  }

  async function handleRecovery(event) {
    event.preventDefault()
    setLoading(true)
    setStatus(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setStatus(error
      ? { kind: 'error', title: 'No pudimos enviar el enlace', message: authErrorMessage(error) }
      : { kind: 'success', title: 'Revisa tu correo', message: 'Si existe una cuenta con ese correo, recibirás un enlace para crear una nueva contraseña.' }
    )
    setLoading(false)
  }

  const isRecovery = mode === 'recovery'

  return (
    <AuthShell
      eyebrow={isRecovery ? 'Recuperar acceso' : 'Colección privada'}
      title={isRecovery ? 'Restablecer contraseña' : 'Iniciar sesión'}
      description={isRecovery
        ? 'Te enviaremos un enlace seguro para elegir una nueva contraseña.'
        : 'Accede a tus obras, certificados y movimientos de colección.'}
      footer={isRecovery ? (
        <button type="button" className={styles.textButton} onClick={() => { setMode('login'); setStatus(null) }}>
          Volver a iniciar sesión
        </button>
      ) : (
        <>¿Aún no tienes cuenta? <Link href={`/signup${requestedDestination ? `?redirect=${encodeURIComponent(requestedDestination)}` : ''}`}>Crear cuenta</Link></>
      )}
    >
      <div className={styles.stack}>
        {status && (
          <InlineNotification
            className={styles.notice}
            kind={status.kind}
            title={status.title}
            subtitle={status.message}
            lowContrast
            hideCloseButton
          />
        )}

        {!isRecovery && (
          <>
            <Button className={styles.fullButton} kind="secondary" size="lg" renderIcon={GoogleIcon} onClick={handleGoogleLogin} disabled={loading}>
              Continuar con Google
            </Button>
            <div className={styles.divider}>o con correo</div>
          </>
        )}

        <form className={styles.form} onSubmit={isRecovery ? handleRecovery : handleLogin}>
          <TextInput
            id="email"
            labelText="Correo electrónico"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nombre@correo.com"
          />
          {!isRecovery && (
            <>
              <PasswordInput
                id="password"
                labelText="Contraseña"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <div className={styles.formMeta}>
                <button type="button" className={styles.textButton} onClick={() => { setMode('recovery'); setStatus(null) }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </>
          )}
          <Button className={styles.fullButton} type="submit" size="lg" renderIcon={ArrowRight} disabled={loading}>
            {isRecovery ? 'Enviar enlace' : 'Entrar'}
          </Button>
          {loading && <InlineLoading description="Procesando…" />}
        </form>
      </div>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  )
}
