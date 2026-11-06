import { NextResponse } from 'next/server'
import { recordArtworkSold } from '@/lib/provenance'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendOrderConfirmationEmail } from '@/lib/emails/sendEmail'
import { mxnFulfillment, pendingMxnAmount, chargedColumns } from '@/lib/stripeCharge'
import { processGuestOpenPrintWebhook } from '@/lib/guestOpenPrintFulfillment.server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Registro de auditoría de la moneda cobrada; nunca bloquea un pedido ya creado.
async function recordCharged(orderId, session, charge) {
  const { error } = await supabase.from('orders').update(chargedColumns(session, charge)).eq('id', orderId)
  if (error) console.error('[payments] charged currency not recorded', { order: orderId, code: error.code })
}

export async function POST(request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error(`❌ Webhook Signature Error: ${err.message}`)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  // Guest Open Edition print purchase. This isolated path never issues original
  // ownership certificates or calls complete_order_originals().
  if (event.data.object?.metadata?.guest_open_prints === 'v1') {
    try {
      return NextResponse.json(await processGuestOpenPrintWebhook(event, stripe))
    } catch (error) {
      console.error('[guest-prints] paid session needs reconciliation', {
        session: event.data.object?.id, reason: error?.message,
      })
      // Never acknowledge a paid-but-unrecorded order as fulfilled.
      return NextResponse.json({ error: 'guest_print_fulfillment_requires_reconciliation' }, { status: 500 })
    }
  }

  // Numbered physical edition: dedicated transactional unit path.
  // Must not call complete_order_originals() or artwork-level SOLD provenance.
  if (
    ['checkout.session.completed', 'checkout.session.expired'].includes(event.type) &&
    event.data.object?.metadata?.physical_edition_checkout === 'v1'
  ) {
    const session = event.data.object
    const holdId = session.metadata.physical_edition_hold_id
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!isUuid.test(holdId || '')) {
      console.error('[physical-edition] invalid hold metadata', { session: session.id })
      return NextResponse.json({ error: 'edition_invalid_hold' }, { status: 400 })
    }
    if (event.type === 'checkout.session.expired') {
      const { error } = await supabase.rpc('expire_physical_edition_checkout_hold', {
        _hold: holdId, _session: session.id,
      })
      if (error) {
        console.error('[physical-edition] expiry requires reconciliation', { session: session.id, code: error.message })
        return NextResponse.json({ error: 'edition_expiration_failed' }, { status: 500 })
      }
      return NextResponse.json({ received: true, expired: true })
    }
    if (session.mode !== 'payment' || session.payment_status !== 'paid') {
      return NextResponse.json({ received: true, unpaid: true })
    }
    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 })
      if (lineItems.has_more || lineItems.data.length !== 1 || lineItems.data[0].quantity !== 1) {
        throw new Error('edition_line_items_invalid')
      }
      const paid = mxnFulfillment(session, lineItems.data)
      if (paid.units.length !== 1 || paid.total <= 0 ||
          Math.abs(paid.units[0] - paid.total) > 0.01) {
        throw new Error('edition_payment_amount_invalid')
      }
      const shipping = session.collected_information?.shipping_details?.address ||
        session.shipping_details?.address || session.customer_details?.address || {}
      const { data: sale, error } = await supabase.rpc('fulfill_physical_edition_checkout', {
        _hold: holdId,
        _session: session.id,
        _intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
        _email: session.customer_details?.email || session.customer_email,
        _name: session.customer_details?.name || null,
        _phone: session.customer_details?.phone || null,
        _shipping: shipping,
        _amount: paid.total,
      })
      if (error || !sale?.order_id) throw new Error(error?.message || 'edition_fulfillment_failed')
      await recordCharged(sale.order_id, session, paid.charge)
      if (!sale.existing) {
        // Do not generate or claim the old artwork-level certificate here.
        if (session.customer_details?.email || session.customer_email) {
          await sendOrderConfirmationEmail(session.customer_details?.email || session.customer_email, {
            orderId: sale.order_id,
            orderUrl: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.josuebeltranuresti.com'}/orders/${sale.order_id}`,
            totalAmount: Number(session.amount_total) / 100,
            currency: paid.charge.currency.toUpperCase(),
            artworks: [{ title: lineItems.data[0].description || 'Physical edition', sku: sale.unit_identifier }],
          })
        }
      }
      return NextResponse.json({ received: true, edition: true, duplicate: Boolean(sale.existing) })
    } catch (error) {
      // Never acknowledge unfulfilled paid sessions. Stripe retries; reconcile
      // with authoritative Stripe session before manual refund/release.
      console.error('[physical-edition] paid session requires reconciliation', { session: session.id, code: error.message })
      return NextResponse.json({ error: 'paid_edition_requires_reconciliation' }, { status: 500 })
    }
  }

  // Same existing order contract for accepted offers and auction winners.
  if(event.type==='checkout.session.completed'){
    const session=event.data.object,m=session.metadata||{}
    if(m.pending_contract==='v1'&&(m.offer_id||(m.auction_id&&m.auction_sale_type==='BID'))){
      if(session.mode!=='payment'||session.payment_status!=='paid')return NextResponse.json({received:true,unpaid:true})
      const shipping=session.collected_information?.shipping_details?.address||session.shipping_details?.address||session.customer_details?.address||{}
      let pendingAmount
      try{pendingAmount=pendingMxnAmount(session)}catch(e){console.error('[payments] paid session requires reconciliation',{session:session.id,code:e.message});return NextResponse.json({error:'Paid purchase requires reconciliation'},{status:500})}
      const {data:sale,error}=await supabase.rpc('finalize_pending_purchase',{_source:m.offer_id?'OFFER':'AUCTION',_id:m.offer_id||m.auction_id,_user:m.user_id,_session:session.id,_intent:session.payment_intent,_amount:pendingAmount.amount,_currency:'mxn',_paid_at:new Date(event.created*1000).toISOString(),_name:session.customer_details?.name||null,_phone:session.customer_details?.phone||null,_shipping:shipping})
      if(error||!sale?.order_id){console.error('[payments] fulfillment requires reconciliation',{session:session.id,error});return NextResponse.json({error:'Paid purchase requires reconciliation'},{status:500})}
      await recordArtworkSold({artworkId:sale.artwork_id,orderId:sale.order_id,auction:m.auction_id?{id:m.auction_id,saleType:'BID'}:null},supabase)
      await recordCharged(sale.order_id,session,pendingAmount.charge)
      if(!sale.existing&&sale.email)await sendOrderConfirmationEmail(sale.email,{orderId:sale.order_id,orderUrl:`${process.env.NEXT_PUBLIC_SITE_URL||'https://www.josuebeltranuresti.com'}/orders/${sale.order_id}`,totalAmount:Number(session.amount_total)/100,currency:pendingAmount.charge.currency.toUpperCase(),artworks:[{title:sale.title,sku:sale.sku}]})
      return NextResponse.json({received:true,duplicate:!!sale.existing})
    }
  }

  if (event.type !== 'checkout.session.completed') return NextResponse.json({received:true})
  const session=event.data.object
  if(session.mode!=='payment'||session.payment_status!=='paid')return NextResponse.json({received:true,unpaid:true})
  try {
    const metadata=session.metadata||{}
    const items=metadata.purchased_items?JSON.parse(metadata.purchased_items):metadata.purchased_ids?JSON.parse(metadata.purchased_ids).map(id=>({id,type:'ORIGINAL'})):metadata.artwork_id?[{id:metadata.artwork_id,type:metadata.item_type||'ORIGINAL'}]:[]
    if(!Array.isArray(items)||!items.length||items.length>30)throw new Error('invalid_items')
    const existing=await supabase.from('orders').select('id').eq('stripe_session_id',session.id).maybeSingle()
    if(existing.error)throw new Error('order_lookup_failed')
    const lines=await stripe.checkout.sessions.listLineItems(session.id,{limit:100})
    if(lines.has_more||lines.data.length!==items.length)throw new Error('line_items_mismatch')
    const mxn=mxnFulfillment(session,lines.data)
    const fulfillmentItems=items.map((item,index)=>({id:typeof item==='string'?item:item.id||item.artwork_id||item._id,type:typeof item==='string'?'ORIGINAL':item.type||item.item_type||'ORIGINAL',quantity:lines.data[index].quantity,unit_amount:mxn.units[index]}))
    const shipping=session.collected_information?.shipping_details?.address||session.shipping_details?.address||session.customer_details?.address||{}
    const result=await supabase.rpc('fulfill_stripe_order',{_session:session.id,_intent:typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id||null,_email:session.customer_details?.email||session.customer_email,_name:session.customer_details?.name||null,_phone:session.customer_details?.phone||null,_shipping:shipping,_amount:mxn.total,_items:fulfillmentItems,_auction:metadata.auction_id||null,_user:/^[0-9a-f-]{36}$/i.test(metadata.user_id||'')?metadata.user_id:null,_sale_type:metadata.auction_sale_type==='BUY_NOW'?'BUY_NOW':'BID',_auction_amount:metadata.auction_amount?Number(metadata.auction_amount):null,_promo:metadata.welcome_promo_id||null})
    if(result.error||!result.data)throw new Error(result.error?.message||'fulfillment_failed')
    await recordCharged(result.data,session,mxn.charge)
    for(const item of fulfillmentItems)if(item.type!=='PRINT')await recordArtworkSold({artworkId:item.id,orderId:result.data,auction:metadata.auction_id?{id:metadata.auction_id,saleType:metadata.auction_sale_type}:null},supabase)
    if(!existing.data&&session.customer_details?.email)await sendOrderConfirmationEmail(session.customer_details.email,{orderId:result.data,orderUrl:`${process.env.NEXT_PUBLIC_SITE_URL||'https://www.josuebeltranuresti.com'}/orders/${result.data}`,totalAmount:session.amount_total/100,currency:mxn.charge.currency.toUpperCase(),artworks:lines.data.map(line=>({title:line.description||'Artwork',sku:''}))})
    await supabase.from('stripe_events').upsert({id:event.id,type:event.type},{onConflict:'id'})
    return NextResponse.json({received:true})
  } catch(error) {
    // Never acknowledge a paid inventory conflict as fulfilled. Stripe retries; operator reconciles/refunds.
    console.error('[payments] paid session requires reconciliation',{session:session.id,code:error.message})
    return NextResponse.json({error:'Paid purchase requires reconciliation'},{status:500})
  }
}
