import { supabase } from '@/lib/supabaseClient'

/** Encabezado Authorization con la sesión actual, para que el servidor verifique al usuario. */
export async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
