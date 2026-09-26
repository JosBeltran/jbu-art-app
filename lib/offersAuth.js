import { createClient } from '@supabase/supabase-js'

export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
}

export async function getRequestUser(request, db) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const { data, error } = await db.auth.getUser(token)
  if (error) return null
  return data?.user || null
}

export async function isAdminUser(user, db) {
  if (!user) return false
  const [{ data: profile }, { data: userRow }] = await Promise.all([
    db.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    db.from('users').select('role').eq('id', user.id).maybeSingle()
  ])
  const role = String(profile?.role || userRow?.role || '').toUpperCase()
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return role === 'ADMIN' || role === 'ADMINISTRADOR' || adminEmails.includes((user.email || '').toLowerCase())
}

export const OFFER_SELECT = 'id, artwork_id, user_id, guest_name, guest_email, offer_amount_mxn, message, status, created_at, artworks(id, sku, title, primary_image_url, base_price_mxn, calculated_price_mxn)'
