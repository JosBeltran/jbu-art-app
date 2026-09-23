'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, PasswordInput } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import { supabase } from '@/lib/supabaseClient'
import { authErrorMessage } from '@/lib/authRedirect'
import { useI18n } from '@/components/I18nProvider'
import styles from '../login/AuthForm.module.css'

export default function ResetPasswordPage() {
  const { t, lang } = useI18n()
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
      setStatus({ kind: 'error', title: t('Las contraseñas no coinciden', 'Passwords do not match'), message: t('Escribe la misma contraseña en ambos campos.', 'Enter the same password in both fields.') })
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setStatus({ kind: 'error', title: t('No pudimos actualizarla', 'We could not update it'), message: authErrorMessage(error, lang) })
    } else {
      setComplete(true)
    }
    setLoading(false)
  }

  return (
    <AuthShell
      eyebrow={t('Recuperación segura', 'Secure recovery')}
      title={complete ? t('Contraseña actualizada', 'Password updated') : t('Nueva contraseña', 'New password')}
      description={complete ? t('Ya puedes volver a tu colección.', 'You can now return to your collection.') : t('Elige una contraseña nueva para tu cuenta.', 'Choose a new password for your account.')}
      footer={<Link href="/login">{t('Volver a iniciar sesión', 'Back to sign in')}</Link>}
    >
      {loading && !ready ? <InlineLoading description={t('Validando enlace…', 'Validating link…')} /> : complete ? (
        <div className={styles.successPanel}>
          <InlineNotification kind="success" title={t('Cambio guardado', 'Change saved')} subtitle={t('Tu nueva contraseña ya está activa.', 'Your new password is now active.')} lowContrast hideCloseButton />
          <Button className={styles.fullButton} as={Link} href="/login" size="lg" renderIcon={ArrowRight}>{t('Iniciar sesión', 'Sign in')}</Button>
        </div>
      ) : !ready ? (
        <InlineNotification kind="error" title={t('Este enlace no es válido', 'This link is not valid')} subtitle={t('Solicita un enlace nuevo desde la pantalla de acceso.', 'Request a new link from the sign-in screen.')} lowContrast hideCloseButton />
      ) : (
        <div className={styles.stack}>
          {status && <InlineNotification kind={status.kind} title={status.title} subtitle={status.message} lowContrast hideCloseButton />}
          <form className={styles.form} onSubmit={handleReset}>
            <PasswordInput id="new-password" labelText={t('Nueva contraseña', 'New password')} helperText={t('Mínimo 8 caracteres', 'Minimum 8 characters')} minLength={8} required autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <PasswordInput id="confirm-password" labelText={t('Confirmar contraseña', 'Confirm password')} minLength={8} required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <Button className={styles.fullButton} type="submit" size="lg" renderIcon={ArrowRight} disabled={loading}>{t('Guardar contraseña', 'Save password')}</Button>
            {loading && <InlineLoading description={t('Guardando…', 'Saving…')} />}
          </form>
        </div>
      )}
    </AuthShell>
  )
}
