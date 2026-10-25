import Stripe from 'stripe'
import { serviceClient, getRequestUser } from '@/lib/offersAuth'
import {paymentFrom,paymentState} from '@/lib/payments/pending'
import {refreshPayments} from '@/lib/payments/pending.server'
import { isArtworkPurchasable } from '@/lib/artworkStatus'

const absoluteImage = (img) => {
  if (!img) return null
  if (img.startsWith('http')) return img
  if(img.startsWith('assets-optimized/')||img.startsWith('/'))return new URL(img.startsWith('/')?img:`/${img}`,process.env.NEXT_PUBLIC_SITE_URL||'https://www.josuebeltranuresti.com').href
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

  if(kind==='BUY_NOW')await db.rpc('settle_auctions',{_auction:auctionId});else await refreshPayments(db,user)
  const { data: a, error } = await db.from(kind==='OFFER'?'artwork_offers':'auctions').select('*').eq('id', auctionId).maybeSingle()
  if (error || !a) return { status: 404, body: { error: 'Subasta no encontrada' } }

  const { data: art } = await db.from('artworks').select('*').eq('id', a.artwork_id).maybeSingle()
  if (!art || !isArtworkPurchasable(art)) return { status: 409, body: { error: 'Esta obra ya no está disponible' } }

  let amount
  let pending=null
  const source=kind==='OFFER'?'OFFER':'AUCTION'
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
    pending=paymentFrom(source,a)
    if(!pending||pending.buyer_id!==user.id)return {status:403,body:{error:'Solo el comprador autorizado puede pagar.'}}
    if(paymentState(pending,user.id)!=='PENDING')return {status:409,body:{error:'El pago ya no está disponible o venció.'}}
    amount=pending.amount
  }
  if (!Number.isFinite(amount) || amount <= 0) return { status: 400, body: { error: 'Monto inválido' } }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const nowSeconds=Math.floor(Date.now()/1000)
  const due=pending?Math.floor(Date.parse(pending.payment_due_at)/1000):null
  if(pending&&a.stripe_session_id){const previous=await stripe.checkout.sessions.retrieve(a.stripe_session_id);if(previous.status==='open'&&previous.expires_at>nowSeconds&&previous.expires_at<=due)return {status:200,body:{url:previous.url}};if(previous.status==='complete')return {status:409,body:{error:'Tu pago se está confirmando.'}}}
  if(due&&due<=nowSeconds+1805)return {status:409,body:{error:'No queda tiempo suficiente para abrir un nuevo pago antes del vencimiento.'}}
  let attempt=null
  if(pending){const prepared=await db.rpc('prepare_pending_checkout',{_source:source,_id:a.id,_user:user.id});if(prepared.error||!prepared.data?.id)return {status:409,body:{error:'No se pudo preparar el pago. Vuelve a consultar la obra.'}};attempt=prepared.data}
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
          description: `${kind === 'BUY_NOW' ? 'Subasta — Comprar ya' : source==='OFFER'?'Oferta aceptada':'Subasta — Pago del ganador'} — SKU: ${art.sku || 'N/A'}`,
          images: image ? [image] : [],
        },
        unit_amount: Math.round(amount * 100),
      },
      quantity: 1,
    }],
    success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/artwork/${art.sku}`,
    shipping_address_collection: { allowed_countries: ['MX', 'US', 'CA'] },
    expires_at: attempt?Number(attempt.expires_at):nowSeconds+1800,
    metadata: {
      user_id: user.id,
      ...(pending?{pending_contract:'v1'}:{}),
      ...(source==='OFFER'?{offer_id:a.id,offer_amount:String(amount)}:{auction_id:a.id,auction_sale_type:kind,auction_amount:String(amount)}),
      purchased_items: JSON.stringify([{ id: art.id, type: 'ORIGINAL', variant_id: null }]),
      purchased_ids: JSON.stringify([art.id]),
    },
  }, pending?{idempotencyKey:`pending:${source}:${a.id}:${attempt.id}`}:undefined)
  if(pending){const saved=await db.rpc('register_pending_checkout',{_source:source,_id:a.id,_user:user.id,_session:session.id,_expires:new Date(session.expires_at*1000).toISOString(),_previous:a.stripe_session_id||null});if(saved.error||saved.data!==true)return {status:409,body:{error:'El derecho de pago cambió. Vuelve a consultar la obra.'}}}
  return { status: 200, body: { url: session.url } }
}
