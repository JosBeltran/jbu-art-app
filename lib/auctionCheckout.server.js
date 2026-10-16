import Stripe from 'stripe'
import { serviceClient, getRequestUser } from '@/lib/offersAuth'
import { isArtworkPurchasable } from '@/lib/artworkStatus'

const absoluteImage = (img) => {
  if (!img) return null
  if (img.startsWith('http')) return img
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${img}`
}

/**
 * Crea la sesión de Stripe para una subasta (Comprar ya o pago del ganador).
 * Todo precio sale de la base de datos; nunca del navegador.
 */
export async function createAuctionCheckout(request, auctionId, kind) {
  const db = serviceClient()
  const user = await getRequestUser(request, db)
  if (!user) return { status: 401, body: { error: 'Inicia sesión para continuar' } }
  if (!/^[0-9a-f-]{36}$/i.test(String(auctionId))) return { status: 400, body: { error: 'Subasta inválida' } }

  await db.rpc('settle_auctions', { _auction: auctionId })
  const { data: a, error } = await db.from('auctions').select('*').eq('id', auctionId).maybeSingle()
  if (error || !a) return { status: 404, body: { error: 'Subasta no encontrada' } }

  const { data: art } = await db.from('artworks').select('*').eq('id', a.artwork_id).maybeSingle()
  if (!art || !isArtworkPurchasable(art)) return { status: 409, body: { error: 'Esta obra ya no está disponible' } }

  let amount
  if (kind === 'BUY_NOW') {
    if (a.status !== 'LIVE' || !a.buy_now_price) return { status: 409, body: { error: 'Comprar ya no está disponible en esta subasta' } }
    if (new Date(a.ends_at) <= new Date()) return { status: 409, body: { error: 'La subasta ya terminó' } }
    // Un lote no se puede adquirir antes de que abra su evento padre
    const { data: effStart, error: effErr } = await db.rpc('auction_effective_start', { _auction: a.id })
    let opensAt = effErr ? null : effStart
    if (effErr && a.auction_event_id) {
      const { data: ev } = await db.from('auction_events').select('starts_at').eq('id', a.auction_event_id).maybeSingle()
      opensAt = ev?.starts_at && new Date(ev.starts_at) > new Date(a.starts_at) ? ev.starts_at : a.starts_at
    }
    if (new Date(opensAt || a.starts_at) > new Date()) return { status: 409, body: { error: 'La subasta aún no abre' } }
    amount = Number(a.buy_now_price)
  } else {
    if (a.status !== 'SOLD' || a.sale_type !== 'BID' || a.winner_id !== user.id) return { status: 403, body: { error: 'Solo el ganador puede pagar esta subasta' } }
    if (a.payment_status === 'PAID') return { status: 409, body: { error: 'Esta subasta ya está pagada' } }
    if (a.payment_due_at && new Date(a.payment_due_at) < new Date()) return { status: 409, body: { error: 'El plazo de pago venció. Escríbenos para ayudarte.' } }
    amount = Number(a.winning_amount || a.current_bid)
  }
  if (!Number.isFinite(amount) || amount <= 0) return { status: 400, body: { error: 'Monto inválido' } }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const image = absoluteImage(art.primary_image_url)
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer_email: user.email || undefined,
    line_items: [{
      price_data: {
        currency: 'mxn',
        product_data: {
          name: art.title || 'Obra de Arte',
          description: `${kind === 'BUY_NOW' ? 'Subasta — Comprar ya' : 'Subasta — Pago del ganador'} — SKU: ${art.sku || 'N/A'}`,
          images: image ? [image] : [],
        },
        unit_amount: Math.round(amount * 100),
      },
      quantity: 1,
    }],
    success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/artwork/${art.sku}`,
    shipping_address_collection: { allowed_countries: ['MX', 'US', 'CA'] },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: {
      user_id: user.id,
      auction_id: a.id,
      auction_sale_type: kind,
      auction_amount: String(amount),
      purchased_items: JSON.stringify([{ id: art.id, type: 'ORIGINAL', variant_id: null }]),
      purchased_ids: JSON.stringify([art.id]),
    },
  })
  return { status: 200, body: { url: session.url } }
}
