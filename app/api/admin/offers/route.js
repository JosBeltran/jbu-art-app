import { NextResponse } from 'next/server'
import {requirePreviewAdmin} from '@/lib/collection/admin.server'
import {deliverNotificationEmails} from '@/lib/notifications.server'
import { serviceClient, OFFER_SELECT } from '@/lib/offersAuth'

const STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED']

async function guard(request) {
  try{const user=await requirePreviewAdmin(request);return {db:serviceClient(),user}}catch(e){return {res:NextResponse.json({error:e.code||'Unauthorized'},{status:e.status||503})}}
}

export async function GET(request) {
  const { db, res } = await guard(request)
  if (res) return res
  const { data, error } = await db.from('artwork_offers').select(OFFER_SELECT).order('created_at', { ascending: false })
  if (error) {
    console.error('admin offers:', error)
    return NextResponse.json({ error: 'No se pudieron cargar las ofertas.' }, { status: 500 })
  }
  return NextResponse.json({ offers: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request) {
  const { db, user, res } = await guard(request)
  if (res) return res
  const { id, status } = await request.json().catch(() => ({}))
  if (!id || !STATUSES.includes(status)) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { data:offer,error } = await db.rpc('set_offer_decision',{_offer:id,_status:status,_admin:user.id})
  if (error) {
    console.error('admin offers patch:', error)
    return NextResponse.json({ error:error.message||'No se pudo actualizar la oferta.' }, { status:error.message?.includes('not_found')?404:409 })
  }
  if(!offer?.id)return NextResponse.json({error:'Oferta no encontrada.'},{status:404})
  await deliverNotificationEmails(db,id)
  return NextResponse.json({ success: true,offer })
}
