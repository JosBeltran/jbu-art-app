'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InlineLoading } from '@carbon/react'
import AuthShell from '@/components/auth/AuthShell'
import { supabase } from '@/lib/supabaseClient'
import { consumeAuthDestination, safeRedirectPath } from '@/lib/authRedirect'

function CallbackView() {
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
      eyebrow="Acceso"
      title="Entrando a tu cuenta"
      description="Estamos confirmando tu identidad, esto toma unos segundos."
    >
      <InlineLoading description="Validando sesión…" />
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
