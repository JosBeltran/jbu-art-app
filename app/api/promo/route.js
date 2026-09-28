import { NextResponse } from 'next/server'
import { promoAdminClient, userFromRequest, getCampaign, remainingClaims, WELCOME_PROMOTION_ID } from '@/lib/welcomePromotion.server'

export const dynamic = 'force-dynamic'

// Estado público de la campaña y, si hay sesión, el estado del usuario.
export async function GET(req) {
  try {
    const admin = promoAdminClient()
    const campaign = await getCampaign(admin)
    const remaining = await remainingClaims(admin, campaign)
    const user = await userFromRequest(req, admin)
    let status = null
    if (user && campaign) {
      const { data } = await admin
        .from('welcome_promotions')
        .select('status')
        .eq('user_id', user.id)
        .eq('promotion_id', campaign.id)
        .maybeSingle()
      status = data?.status || null
    }
    return NextResponse.json({ active: Boolean(campaign?.active) && remaining > 0, remaining, percentOff: campaign?.percent_off || 30, status })
  } catch {
    return NextResponse.json({ active: false, remaining: 0, status: null })
  }
}

// Reclama la promoción para el usuario autenticado; la base de datos aplica todas las reglas.
export async function POST(req) {
  const admin = promoAdminClient()
  const user = await userFromRequest(req, admin)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await admin.rpc('claim_welcome_promotion', { _user_id: user.id, _promotion_id: WELCOME_PROMOTION_ID })
  if (error) return NextResponse.json({ status: 'ERROR' }, { status: 500 })
  return NextResponse.json({ status: data })
}
