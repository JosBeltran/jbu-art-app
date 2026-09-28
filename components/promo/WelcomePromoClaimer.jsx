'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Al iniciar sesión, pide al servidor reclamar la promoción. El servidor decide si aplica
// (cuenta nueva, cupo disponible, una sola vez por usuario).
export default function WelcomePromoClaimer() {
  useEffect(() => {
    const tryClaim = async (session) => {
      if (!session?.user) return
      const key = `jbu-promo-claim-${session.user.id}`
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
      try {
        await fetch('/api/promo', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
      } catch {}
    }
    supabase.auth.getSession().then(({ data }) => tryClaim(data?.session))
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') tryClaim(session)
    })
    return () => listener?.subscription?.unsubscribe()
  }, [])
  return null
}
