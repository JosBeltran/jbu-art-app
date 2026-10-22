import { createClient } from '@supabase/supabase-js'
import { HttpError, bearerToken, serviceClient } from '../certificates/adminAuth.server.js'
import { loadCollection } from './data.js'

export function validProfileId(id) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '')) }
export function maskEmail(email) { const [name, domain] = String(email || '').split('@'); return domain ? `${name.slice(0, 1)}***@${domain}` : null }
function userClient(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new HttpError(503, 'auth_unavailable')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
}
// Fail closed: never trust legacy profiles.role, users.role or a public email allowlist.
export async function requirePreviewAdmin(request, makeClient = userClient) {
  const token = bearerToken(request)
  if (!token) throw new HttpError(401, 'unauthorized')
  const db = makeClient(token)
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) throw new HttpError(401, 'unauthorized')
  const role = await db.from('user_roles').select('role').eq('user_id', data.user.id).eq('role', 'admin')
  if (role.error) throw new HttpError(503, 'separate_roles_unavailable')
  if (!role.data?.some(r => r.role === 'admin')) throw new HttpError(403, 'forbidden')
  return data.user
}
export async function collectorPreview(request, profileId, { authorize = requirePreviewAdmin, makeService = serviceClient } = {}) {
  await authorize(request)
  if (!validProfileId(profileId)) throw new HttpError(400, 'invalid_profile_id')
  const db = makeService()
  const profile = await db.from('profiles').select('id,full_name,email').eq('id', profileId).maybeSingle()
  if (profile.error) throw new HttpError(503, 'profiles_unavailable')
  if (!profile.data) throw new HttpError(404, 'collector_not_found')
  const target = await db.auth.admin.getUserById(profileId)
  const authUser = target.error ? null : target.data?.user
  // Repository association is profiles.id == auth.users.id. Never guess by name/email.
  const identity = { id: profileId, email: authUser?.email || null }
  const collection = await loadCollection(db, identity)
  const warnings = [...collection.warnings]
  if (!authUser) warnings.push({ section: 'identity', code: 'auth_association_unverified' })
  if (authUser?.email && profile.data.email !== authUser.email) warnings.push({ section: 'identity', code: 'profile_email_differs_from_auth' })
  const roles = await db.from('user_roles').select('role').eq('user_id', profileId)
  if (roles.error) warnings.push({ section: 'roles', code: 'roles_unavailable' })
  return {
    mode: 'data', readOnly: true,
    collector: { id: profileId, full_name: profile.data.full_name || 'Collector', email: maskEmail(authUser?.email || profile.data.email) },
    collection,
    diagnostics: { profileId, authUserId: authUser?.id || null, roles: roles.data?.map(r => r.role) || [], warnings,
      expected: { artworks: collection.artworks.length, certificates: collection.certificates.length, pendingClaims: collection.pendingClaims.length, claimGroups: collection.groups.length },
      permission: { status: 'not_verified', reason: 'requires_read_only_database_audit', counts: null } },
  }
}
