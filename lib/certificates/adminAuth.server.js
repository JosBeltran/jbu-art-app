// Autorización Admin para endpoints de certificados. La identidad sale SOLO del token de sesión;
// el rol se resuelve con public.is_jbu_admin() ejecutada con el JWT del propio usuario.
import { createClient } from '@supabase/supabase-js'

export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code }
}

export function bearerToken(request) {
  const header = request?.headers?.get?.('authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

function defaultUserClient(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new HttpError(503, 'auth_unavailable')
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new HttpError(503, 'service_unavailable')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Devuelve { user } del Admin o lanza HttpError 401/403/503. */
export async function requireCertificateAdmin(request, { makeUserClient = defaultUserClient } = {}) {
  const token = bearerToken(request)
  if (!token) throw new HttpError(401, 'unauthorized')
  const client = makeUserClient(token)
  const { data, error } = await client.auth.getUser(token)
  const user = data?.user
  if (error || !user) throw new HttpError(401, 'unauthorized')
  const { data: isAdmin, error: roleError } = await client.rpc('is_jbu_admin')
  if (roleError) throw new HttpError(503, 'role_check_unavailable')
  if (isAdmin !== true) throw new HttpError(403, 'forbidden')
  return { user }
}

export function errorResponse(err, scope) {
  const status = err instanceof HttpError ? err.status : 500
  const code = err instanceof HttpError ? err.code : 'internal_error'
  console.error(`[certificates] ${scope} failed`, { status, code, reason: err?.code || err?.message })
  return Response.json({ error: code }, { status })
}
