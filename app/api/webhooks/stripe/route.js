import { NextResponse } from 'next/server'
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
        let unitPriceMxn = artwork.base_price_mxn || 0

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
          await supabase
            .from('artworks')
            .update({
              ownership_status: 'SOLD',
              claim_token: claimToken,
              certificate_hash: null,
              claim_notes: `Original comprado por ${customerEmail}. Orden: ${order.id}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', artwork.id)

          // Proveniencia aislada
          try {
            await supabase
              .from('provenance_events')
              .insert([{
                artwork_id: artwork.id,
                event_type: 'SOLD',
                title: 'Adquisición — Colección Privada',
                description: `Obra adquirida a través de la galería digital. Certificado de Autenticidad emitido.`,
                event_date: new Date().getFullYear().toString()
              }])
          } catch (provErr) {
            console.warn('⚠️ No se pudo registrar la proveniencia:', provErr)
          }
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
      return NextResponse.json({ error: 'Error interno', details: err.message }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}