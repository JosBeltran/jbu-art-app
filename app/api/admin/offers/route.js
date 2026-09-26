import { NextResponse } from 'next/server'
import { serviceClient, getRequestUser, isAdminUser, OFFER_SELECT } from '@/lib/offersAuth'

const STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED']

async function guard(request) {
  const db = serviceClient()
  const user = await getRequestUser(request, db)
  if (!user) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await isAdminUser(user, db))) return { res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db }
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
  const { db, res } = await guard(request)
  if (res) return res
  const { id, status } = await request.json().catch(() => ({}))
  if (!id || !STATUSES.includes(status)) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { error } = await db.from('artwork_offers').update({ status }).eq('id', id)
  if (error) {
    console.error('admin offers patch:', error)
    return NextResponse.json({ error: 'No se pudo actualizar la oferta.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
