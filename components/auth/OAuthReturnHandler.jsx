'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { consumeAuthDestination, hasPendingAuthReturn, safeRedirectPath } from '@/lib/authRedirect'

/**
 * Completa el acceso con proveedores externos (Google) cuando el usuario
 * regresa a una pantalla distinta a /auth/callback, por ejemplo la portada.
 * No cambia la lógica de sesión: solo termina el intercambio pendiente,
 * limpia la dirección y lleva al destino solicitado.
 */
export default function OAuthReturnHandler() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (pathname?.startsWith('/auth/callback')) return
    if (!hasPendingAuthReturn()) return

    const url = new URL(window.location.href)
    const code = url.searchParams.get('code')
    const hasHashToken = url.hash.includes('access_token')
    if (!code && !hasHashToken) return

    let active = true

    const finish = async () => {
      if (code) {
        try {
          await supabase.auth.exchangeCodeForSession(code)
        } catch {
          /* la sesión puede haberse establecido automáticamente */
        }
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return

      url.searchParams.delete('code')
      url.searchParams.delete('state')
      const cleanSearch = url.searchParams.toString()
      window.history.replaceState({}, '', `${url.pathname}${cleanSearch ? `?${cleanSearch}` : ''}`)

      const next = safeRedirectPath(consumeAuthDestination(), '/profile')
      if (session) router.replace(next)
    }

    finish()

    return () => {
      active = false
    }
  }, [pathname, router])

  return null
}
