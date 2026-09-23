'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InlineLoading } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import { supabase } from '@/lib/supabaseClient'
import { consumeAuthDestination, safeRedirectPath } from '@/lib/authRedirect'
import { useI18n } from '@/components/I18nProvider'

function CallbackView() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    let active = true

    const finish = async () => {
      const code = searchParams.get('code')

      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {
          /* la sesión puede haberse establecido automáticamente */
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return

      const stored = consumeAuthDestination()
      const next = safeRedirectPath(searchParams.get('next') || stored, '/profile')

      router.replace(session ? next : '/login?error=auth-code-error')
    }

    finish()

    return () => {
      active = false
    }
  }, [router, searchParams])

  return (
    <AuthShell
      eyebrow={t('Acceso', 'Access')}
      title={t('Entrando a tu cuenta', 'Signing in to your account')}
      description={t('Estamos confirmando tu identidad, esto toma unos segundos.', "We're confirming your identity, this takes a few seconds.")}
    >
      <InlineLoading description={t('Validando sesión…', 'Validating session…')} />
    </AuthShell>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackView />
    </Suspense>
  )
}
