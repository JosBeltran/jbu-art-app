import { NextResponse } from 'next/server'
import {refreshPayments} from '@/lib/payments/pending.server'
import { serviceClient, getRequestUser, OFFER_SELECT } from '@/lib/offersAuth'

export async function GET(request) {
  const db = serviceClient()
  const user = await getRequestUser(request, db)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try{await refreshPayments(db,user)}catch(e){return NextResponse.json({error:e.message},{status:503})}

  const { data, error } = await db
    .from('artwork_offers')
    .select(OFFER_SELECT)
    .eq('user_id',user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('my-offers:', error)
    return NextResponse.json({ error: 'No se pudieron cargar tus ofertas.' }, { status: 500 })
  }
  return NextResponse.json({ offers: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}
