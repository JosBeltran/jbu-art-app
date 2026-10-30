import { NextResponse } from 'next/server'
import {deliveryAdmin} from '@/lib/localDelivery.server'
import { serviceClient, getRequestUser, isAdminUser } from '@/lib/offersAuth'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'no-store' }

// Detalle de una orden: solo para quien la compró (mismo correo) o un administrador.
export async function GET(request, { params }) {
  try {
    const { id } = await params
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })

    const db = serviceClient()
    const user = await getRequestUser(request, db)
    if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401, headers: noStore })

    const { data: order } = await db.from('orders').select('*').eq('id', id).maybeSingle()
    if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: noStore })

    const owner = order.buyer_user_id ? order.buyer_user_id === user.id : Boolean(user.email_confirmed_at) && String(order.buyer_email || '').trim().toLowerCase() === String(user.email || '').trim().toLowerCase()
    let admin=false
    if(!owner){try{await deliveryAdmin(request,db);admin=true}catch{}}
    if (!owner && !admin) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore })

    const { data: items } = await db.from('order_items')
      .select('*, claim_groups ( group_token ), artworks ( sku, primary_image_url )')
      .eq('order_id', id)

    const {notes,calendar_error,calendar_lease,calendar_lease_until,...buyerOrder}=order
    return NextResponse.json({ order:admin?order:buyerOrder, items: items || [] }, { headers: noStore })
  } catch (error) {
    console.error('Error al consultar la orden:', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: noStore })
  }
}
