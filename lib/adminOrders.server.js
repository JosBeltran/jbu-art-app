import { createClient } from '@supabase/supabase-js'

/** Orders authorization uses a verified session and separate roles, never profile fields or email lists. */
export async function authorizeOrderAdmin(request) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return { error: 'auth_required', status: 401 }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return { error: 'admin_configuration_required', status: 503 }
  const scoped = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await scoped.auth.getUser(token)
  if (error || !data?.user) return { error: 'auth_required', status: 401 }
  const { data: roles, error: roleError } = await scoped.from('user_roles').select('role').eq('user_id', data.user.id)
  if (roleError) {
    console.error('Admin orders role lookup:', { code: roleError.code })
    return { error: 'admin_roles_unavailable', status: 503 }
  }
  if (!roles?.some((row) => String(row.role).toLowerCase() === 'admin')) return { error: 'forbidden', status: 403 }
  // The existing privileged API pattern is used only after verified role authorization.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return { error: 'admin_configuration_required', status: 503 }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return { db }
}