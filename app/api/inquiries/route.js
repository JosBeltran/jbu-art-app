import { NextResponse } from 'next/server'
import { serviceClient, getRequestUser } from '@/lib/offersAuth'
import { resolveInquiryChannel, inquiryArtworkUrl } from '@/lib/inquiry'
import { getPriceDisplayMode } from '@/lib/artworkCommerce'
import { getAvailability } from '@/lib/artworkStatus'

export const runtime = 'nodejs'

const MAX_PER_WINDOW = 5
const WINDOW_MS = 10 * 60 * 1000

/**
 * Consulta de precio (canal EMAIL / INTERNAL).
 *
 * WHATSAPP nunca llega aquí: es un enlace directo sin registro.
 * La obra se valida en servidor (existe, disponible y con precio oculto);
 * el canal se relee de site_settings, no del cuerpo de la petición.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }

  const sku = String(body?.sku || '').trim()
  const artworkId = String(body?.artworkId || '').trim()
  const locale = String(body?.locale || 'es').startsWith('en') ? 'en' : 'es'
  const name = String(body?.name || '').trim().slice(0, 120) || null
  const email = String(body?.email || '').trim().slice(0, 200) || null
  const message = String(body?.message || '').trim().slice(0, 1000) || null

  if (!sku && !artworkId) {
    return NextResponse.json({ error: 'Falta la obra.' }, { status: 400 })
  }

  let db
  try {
    db = serviceClient()
  } catch {
    return NextResponse.json({ error: 'Servicio no disponible.' }, { status: 503 })
  }

  // Canal efectivo: lo decide la configuración del sitio, nunca el cliente.
  const { data: settings } = await db
    .from('site_settings')
    .select('inquiry_channel')
    .eq('id', true)
    .maybeSingle()
  const channel = resolveInquiryChannel(settings)
  if (channel === 'WHATSAPP') {
    return NextResponse.json({ error: 'El canal de consulta configurado es WhatsApp.' }, { status: 409 })
  }

  // Obra validada en servidor.
  let query = db
    .from('artworks')
    .select('id, sku, title, status, availability_status, ownership_status, price_display_mode')
  query = artworkId ? query.eq('id', artworkId) : query.eq('sku', sku)
  const { data: artwork, error: artError } = await query.maybeSingle()
  if (artError || !artwork) {
    return NextResponse.json({ error: 'Obra no encontrada.' }, { status: 404 })
  }
  if (getAvailability(artwork) !== 'AVAILABLE' || getPriceDisplayMode(artwork) !== 'CONTACT_FOR_PRICE') {
    return NextResponse.json({ error: 'Esta obra no acepta consultas de precio.' }, { status: 409 })
  }

  // Identidad opcional: sesión válida o correo declarado.
  const user = await getRequestUser(request, db)
  if (!user && !email) {
    return NextResponse.json({ error: 'Indica un correo para responderte.' }, { status: 400 })
  }

  // Límite sencillo por obra+correo para evitar abuso.
  const identity = user?.id || email
  const since = new Date(Date.now() - WINDOW_MS).toISOString()
  let countQuery = db
    .from('artwork_inquiries')
    .select('id', { count: 'exact', head: true })
    .eq('artwork_id', artwork.id)
    .gte('created_at', since)
  countQuery = user?.id ? countQuery.eq('user_id', user.id) : countQuery.eq('email', email)
  const { count } = await countQuery
  if ((count ?? 0) >= MAX_PER_WINDOW) {
    return NextResponse.json({ error: 'Ya enviaste varias consultas recientes. Te responderemos pronto.' }, { status: 429 })
  }

  const { error: insertError } = await db.from('artwork_inquiries').insert({
    artwork_id: artwork.id,
    sku: artwork.sku,
    title: artwork.title,
    artwork_url: inquiryArtworkUrl(artwork.sku),
    channel,
    user_id: user?.id || null,
    email: user?.email || email,
    name,
    message,
    locale,
  })
  if (insertError) {
    return NextResponse.json({ error: 'No se pudo registrar la consulta.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, identity: Boolean(identity) })
}
