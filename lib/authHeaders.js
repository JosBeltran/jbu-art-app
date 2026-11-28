import { supabase } from '@/lib/supabaseClient'

/** Encabezado Authorization con la sesión actual, para que el servidor verifique al usuario. */
export async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function refreshPublicPrints() {
  const response = await fetch('/api/admin/product-catalog', {
    method: 'POST',
    headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: 'refreshPublicPrints', input: {} }),
  })
  if (!response.ok) throw new Error('print_cache_refresh_failed')
}
