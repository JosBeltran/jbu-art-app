import { createClient } from '@supabase/supabase-js'

export const WELCOME_PROMOTION_ID = 'WELCOME30'

export function promoAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Devuelve el usuario verificado a partir del encabezado Authorization, o null. */
export async function userFromRequest(req, admin = promoAdminClient()) {
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return data.user
}

export async function getCampaign(admin) {
  const { data } = await admin
    .from('promotion_campaigns')
    .select('id, percent_off, max_claims, active')
    .eq('id', WELCOME_PROMOTION_ID)
    .maybeSingle()
  return data || null
}

export async function remainingClaims(admin, campaign) {
  if (!campaign?.active) return 0
  const { count } = await admin
    .from('welcome_promotions')
    .select('id', { count: 'exact', head: true })
    .eq('promotion_id', campaign.id)
  return Math.max(0, campaign.max_claims - (count || 0))
}

/** Promoción aplicable al pago: reclamada, no usada y sin compras previas del usuario. */
export async function applicablePromotion(admin, user) {
  if (!user) return null
  const campaign = await getCampaign(admin)
  if (!campaign?.active) return null
  const { data: promo } = await admin
    .from('welcome_promotions')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('promotion_id', campaign.id)
    .maybeSingle()
  if (!promo || promo.status !== 'CLAIMED') return null
  if (user.email) {
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_email', user.email)
    if ((count || 0) > 0) return null
  }
  return { id: promo.id, percentOff: campaign.percent_off, campaignId: campaign.id }
}
