import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
})

// Se requiere el Service Role Key de Supabase para poder escribir cambios de propiedad/estatus sin restricciones de RLS
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event

  // 1. Validar la firma del Webhook
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error(`❌ Error de verificación de webhook: ${err.message}`)
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  // 2. Procesar evento de Checkout finalizado con éxito
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object

    const artworkId = session.metadata?.artwork_id
    const customerEmail = session.customer_details?.email
    const paymentIntentId = session.payment_intent

    if (!artworkId) {
      console.error('⚠️ No se encontró artwork_id en la metadata de la sesión de Stripe.')
      return NextResponse.json({ received: true })
    }

    try {
      // 3. Buscar si el comprador existe en la tabla profiles por su email
      let buyerUserId = null
      if (customerEmail) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle()

        if (userData) {
          buyerUserId = userData.id
        }
      }

      // 4. Actualizar la obra en Supabase
      const updateData = {
        ownership_status: 'CLAIMED', // O 'RESERVED' según tu lógica de inventario
        updated_at: new Date().toISOString(),
      }

      // Asignar el propietario si se encontró coincidencia de usuario
      if (buyerUserId) {
        updateData.current_owner_id = buyerUserId
      }

      const { error: updateError } = await supabase
        .from('artworks')
        .update(updateData)
        .eq('id', artworkId)

      if (updateError) {
        console.error('❌ Error al actualizar la obra en Supabase:', updateError.message)
        return NextResponse.json({ error: 'Error actualizando base de datos.' }, { status: 500 })
      }

      console.log(`✅ Obra ID ${artworkId} actualizada exitosamente tras pago Stripe (${paymentIntentId})`)

    } catch (err) {
      console.error('❌ Excepción al procesar actualización posventa:', err)
      return NextResponse.json({ error: 'Error procesando evento.' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}