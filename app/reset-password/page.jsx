'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, PasswordInput } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import { supabase } from '@/lib/supabaseClient'
import { authErrorMessage } from '@/lib/authRedirect'
import styles from '../login/AuthForm.module.css'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [complete, setComplete] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let active = true
    const hashType = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type')

    supabase.auth.getSession().then(() => {
      if (!active) return
      setReady(hashType === 'recovery')
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true)
      setLoading(false)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function handleReset(event) {
    event.preventDefault()
    setStatus(null)
    if (password !== confirmPassword) {
      setStatus({ kind: 'error', title: 'Las contraseñas no coinciden', message: 'Escribe la misma contraseña en ambos campos.' })
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setStatus({ kind: 'error', title: 'No pudimos actualizarla', message: authErrorMessage(error) })
    } else {
      setComplete(true)
    }
    setLoading(false)
  }

  return (
    <AuthShell
      eyebrow="Recuperación segura"
      title={complete ? 'Contraseña actualizada' : 'Nueva contraseña'}
      description={complete ? 'Ya puedes volver a tu colección.' : 'Elige una contraseña nueva para tu cuenta.'}
      footer={<Link href="/login">Volver a iniciar sesión</Link>}
    >
      {loading && !ready ? <InlineLoading description="Validando enlace…" /> : complete ? (
        <div className={styles.successPanel}>
          <InlineNotification kind="success" title="Cambio guardado" subtitle="Tu nueva contraseña ya está activa." lowContrast hideCloseButton />
          <Button className={styles.fullButton} as={Link} href="/login" size="lg" renderIcon={ArrowRight}>Iniciar sesión</Button>
        </div>
      ) : !ready ? (
        <InlineNotification kind="error" title="Este enlace no es válido" subtitle="Solicita un enlace nuevo desde la pantalla de acceso." lowContrast hideCloseButton />
      ) : (
        <div className={styles.stack}>
          {status && <InlineNotification kind={status.kind} title={status.title} subtitle={status.message} lowContrast hideCloseButton />}
          <form className={styles.form} onSubmit={handleReset}>
            <PasswordInput id="new-password" labelText="Nueva contraseña" helperText="Mínimo 8 caracteres" minLength={8} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <PasswordInput id="confirm-password" labelText="Confirmar contraseña" minLength={8} required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <Button className={styles.fullButton} type="submit" size="lg" renderIcon={ArrowRight} disabled={loading}>Guardar contraseña</Button>
            {loading && <InlineLoading description="Guardando…" />}
          </form>
        </div>
      )}
    </AuthShell>
  )
}
