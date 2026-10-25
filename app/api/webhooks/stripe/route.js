import { NextResponse } from 'next/server'
import { recordArtworkSold } from '@/lib/provenance'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendOrderConfirmationEmail } from '@/lib/emails/sendEmail'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

  // Same existing order contract for accepted offers and auction winners.
  if(event.type==='checkout.session.completed'){
    const session=event.data.object,m=session.metadata||{}
    if(m.pending_contract==='v1'&&(m.offer_id||(m.auction_id&&m.auction_sale_type==='BID'))){
      if(session.mode!=='payment'||session.payment_status!=='paid')return NextResponse.json({received:true,unpaid:true})
      const shipping=session.collected_information?.shipping_details?.address||session.shipping_details?.address||session.customer_details?.address||{}
      const {data:sale,error}=await supabase.rpc('finalize_pending_purchase',{_source:m.offer_id?'OFFER':'AUCTION',_id:m.offer_id||m.auction_id,_user:m.user_id,_session:session.id,_intent:session.payment_intent,_amount:Number(session.amount_total)/100,_currency:session.currency,_paid_at:new Date(event.created*1000).toISOString(),_name:session.customer_details?.name||null,_phone:session.customer_details?.phone||null,_shipping:shipping})
      if(error||!sale?.order_id){console.error('[payments] fulfillment requires reconciliation',{session:session.id,error});return NextResponse.json({error:'Paid purchase requires reconciliation'},{status:500})}
      await recordArtworkSold({artworkId:sale.artwork_id,orderId:sale.order_id,auction:m.auction_id?{id:m.auction_id,saleType:'BID'}:null},supabase)
      if(!sale.existing&&sale.email)await sendOrderConfirmationEmail(sale.email,{orderId:sale.order_id,orderUrl:`${process.env.NEXT_PUBLIC_SITE_URL||'https://www.josuebeltranuresti.com'}/orders/${sale.order_id}`,totalAmount:Number(session.amount_total)/100,artworks:[{title:sale.title,sku:sale.sku}]})
      return NextResponse.json({received:true,duplicate:!!sale.existing})
    }
  }

  // Idempotencia: cada aviso de Stripe se procesa una sola vez
  let eventRecorded = false
  if (event.type === 'checkout.session.completed') {
    const { error: eventError } = await supabase.from('stripe_events').insert({ id: event.id, type: event.type })
    if (eventError?.code === '23505') return NextResponse.json({ received: true, duplicate: true })
    eventRecorded = !eventError
    const { data: existingOrder } = await supabase.from('orders').select('id').eq('stripe_session_id', event.data.object.id).maybeSingle()
    if (existingOrder) return NextResponse.json({ received: true, duplicate: true })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object

    const customerEmail = session.customer_details?.email || session.customer_email
    const customerName = session.customer_details?.name || 'Cliente Galería'
    const customerPhone = session.customer_details?.phone || null

    const shipping = 
      session.collected_information?.shipping_details?.address ||
      session.shipping_details?.address ||
      session.customer_details?.address ||
      {}

    const shippingAddress = {
      line1: shipping.line1 || '',
      line2: shipping.line2 || '',
      city: shipping.city || '',
      state: shipping.state || '',
      postal_code: shipping.postal_code || '',
      country: shipping.country || ''
    }

    const metadata = session.metadata || {}

    // Extraer items resolviendo diferencias de nombres en propiedades
    let itemsToProcess = []
    if (metadata.purchased_items) {
      try { itemsToProcess = JSON.parse(metadata.purchased_items) } catch (e) {}
    } else if (metadata.purchased_ids) {
      try { 
        const ids = JSON.parse(metadata.purchased_ids)
        itemsToProcess = ids.map(id => ({ id, type: 'ORIGINAL' }))
      } catch (e) {}
    } else if (metadata.artwork_id) {
      itemsToProcess = [{ id: metadata.artwork_id, type: metadata.item_type || 'ORIGINAL' }]
    }

    if (!Array.isArray(itemsToProcess) || itemsToProcess.length === 0) {
      console.warn('⚠️ No se encontraron items en metadata para procesar.')
      return NextResponse.json({ received: true })
    }

    // Subastas: confirmar la venta en la base de datos antes de marcar la obra
    let auctionAmount = null
    if (metadata.auction_id) {
      const { data: saleResult, error: saleError } = await supabase.rpc('complete_auction_sale', {
        _auction: metadata.auction_id,
        _user: metadata.user_id,
        _sale_type: metadata.auction_sale_type === 'BUY_NOW' ? 'BUY_NOW' : 'BID',
        _amount: Number(metadata.auction_amount),
        _session: session.id,
      })
      if (saleError || !['OK', 'ALREADY_PAID'].includes(saleResult)) {
        console.error('❌ Pago de subasta recibido pero la venta no se pudo confirmar (revisar reembolso):', metadata.auction_id, saleResult, saleError)
        return NextResponse.json({ received: true, auction_conflict: saleResult || saleError?.message })
      }
      auctionAmount = Number(metadata.auction_amount) || null
    }

    try {
      // 1. Crear la Orden principal
      console.log('📌 Insertando Orden en Supabase...')
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          stripe_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent,
          buyer_email: customerEmail,
          buyer_name: customerName,
          buyer_phone: customerPhone,
          shipping_address: shippingAddress,
          total_amount_mxn: session.amount_total ? session.amount_total / 100 : 0,
          status: 'PAYMENT_RECEIVED'
        }])
        .select()
        .single()

      if (orderError) {
        console.error('❌ Error al crear la orden en Supabase:', JSON.stringify(orderError, null, 2))
        throw orderError
      }

      console.log(`📦 Orden ${order.id} registrada exitosamente para ${customerEmail}`)

      // Marca la promoción de bienvenida como usada (una sola vez).
      if (metadata.welcome_promo_id) {
        const { error: promoError } = await supabase
          .from('welcome_promotions')
          .update({ status: 'REDEEMED', redeemed_at: new Date().toISOString(), stripe_session_id: session.id })
          .eq('id', metadata.welcome_promo_id)
          .eq('status', 'CLAIMED')
        if (promoError) console.error('⚠️ No se pudo marcar la promoción como usada:', promoError)
      }

      const purchasedArtworksList = []

      // 2. Procesar cada ítem
      console.log('🔍 Items recibidos para procesar:', JSON.stringify(itemsToProcess))

      for (const item of itemsToProcess) {
        // Extrae el ID y normaliza el tipo de producto
        const artworkId = typeof item === 'string' ? item : (item.id || item.artwork_id || item._id)
        const itemType = typeof item === 'object' ? (item.type || item.item_type) : 'ORIGINAL'
        const isPrint = itemType === 'PRINT'

        if (!artworkId) {
          console.error('⚠️ Se omitió un ítem porque no tiene id válido:', item)
          continue
        }

        const claimToken = crypto.randomBytes(8).toString('hex').toUpperCase()

        // Buscar obra en Supabase
        const { data: artwork, error: artworkError } = await supabase
          .from('artworks')
          .select('*')
          .eq('id', artworkId)
          .maybeSingle()

        if (artworkError || !artwork) {
          console.error(`❌ NO SE ENCONTRÓ LA OBRA EN SUPABASE (ID: "${artworkId}"):`, artworkError)
          
          // FALLBACK: Si no existe en artworks, creamos el item con el esquema estricto
          const { error: fallbackItemError } = await supabase
            .from('order_items')
            .insert([{
              order_id: order.id,
              artwork_id: artworkId,
              title_snapshot: 'Obra no encontrada en catálogo',
              sku_snapshot: 'N/A',
              unit_price_mxn: 0,
              quantity: 1,
              claim_token_snapshot: claimToken
            }])

          if (fallbackItemError) {
            console.error('❌ Error al insertar order_item de fallback:', fallbackItemError)
          }
          continue
        }

        let titleSnapshot = artwork.title || artwork.sku || 'Sin Título'
        let unitPriceMxn = (!isPrint && auctionAmount) ? auctionAmount : (artwork.base_price_mxn || 0)

        if (isPrint) {
          unitPriceMxn = artwork.print_price_mxn || artwork.base_price_mxn || 0
          const nextPrintNum = (artwork.prints_sold || 0) + 1

          if (artwork.print_type === 'LIMITED') {
            const printDetailsText = `Print #${nextPrintNum} de ${artwork.print_edition_size || 'N/A'}`
            titleSnapshot = `${titleSnapshot} (${printDetailsText})`
          } else {
            titleSnapshot = `${titleSnapshot} (Print)`
          }

          // Actualizar contador de prints
          await supabase
            .from('artworks')
            .update({ 
              prints_sold: nextPrintNum,
              updated_at: new Date().toISOString()
            })
            .eq('id', artwork.id)

        } else {
          // Marcar Original como VENDIDO
          const soldUpdate = {
            ownership_status: 'SOLD',
            availability_status: 'SOLD',
            claim_token: claimToken,
            certificate_hash: null,
            claim_notes: `Original comprado por ${customerEmail}${metadata.auction_id ? ` (subasta ${metadata.auction_sale_type === 'BUY_NOW' ? 'Comprar ya' : 'puja ganadora'})` : ''}. Orden: ${order.id}`,
            updated_at: new Date().toISOString(),
          }
          let { error: soldError } = await supabase
            .from('artworks')
            .update(soldUpdate)
            .eq('id', artwork.id)
          if (soldError && /availability_status/.test(soldError.message || '')) {
            // La migración 20261022 aún no está aplicada: conserva el flujo actual.
            const { availability_status, ...legacyUpdate } = soldUpdate
            const retry = await supabase.from('artworks').update(legacyUpdate).eq('id', artwork.id)
            soldError = retry.error
          }
          if (soldError) console.error('Error marcando obra como vendida:', soldError)

          // Procedencia: evento SOLD idempotente (no bloquea el pago si falla)
          await recordArtworkSold({
            artworkId: artwork.id,
            orderId: order.id,
            auction: metadata.auction_id ? { id: metadata.auction_id, saleType: metadata.auction_sale_type === 'BUY_NOW' ? 'BUY_NOW' : 'BID' } : null
          }, supabase)
        }

        purchasedArtworksList.push({
          title: titleSnapshot,
          sku: artwork.sku
        })

        // 🟢 INSERCIÓN EN ORDER_ITEMS (Ajustada al esquema estricto de Supabase)
        const orderItemPayload = {
          order_id: order.id,
          artwork_id: artwork.id,
          title_snapshot: titleSnapshot,
          sku_snapshot: artwork.sku || 'N/A',
          unit_price_mxn: unitPriceMxn,
          quantity: 1,
          claim_token_snapshot: isPrint ? null : claimToken
        }

        console.log('📌 Intentando insertar order_item con payload:', orderItemPayload)

        const { data: insertedItem, error: itemError } = await supabase
          .from('order_items')
          .insert([orderItemPayload])
          .select()

        if (itemError) {
          console.error(`❌ ERROR SUPABASE AL INSERTAR ORDER_ITEM:`, JSON.stringify(itemError, null, 2))
        } else {
          console.log(`✅ order_item CREADO CON ÉXITO:`, insertedItem)
        }
      }

      // 3. Generar URL de la orden
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const orderUrl = `${baseUrl}/orders/${order.id}`

      // 4. Enviar correo de confirmación de forma aislada
      if (customerEmail) {
        try {
          await sendOrderConfirmationEmail(customerEmail, {
            orderId: order.id,
            orderUrl: orderUrl,
            totalAmount: order.total_amount_mxn,
            artworks: purchasedArtworksList
          })
          console.log(`✉️ Correo de confirmación enviado a ${customerEmail}`)
        } catch (emailErr) {
          console.error('⚠️ Error enviando correo de confirmación:', emailErr)
        }
      }

    } catch (err) {
      console.error('❌ Error en proceso interno del webhook:', err)
      // Permitir que Stripe reintente este aviso
      if (eventRecorded) await supabase.from('stripe_events').delete().eq('id', event.id)
      return NextResponse.json({ error: 'Error interno', details: err.message }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}