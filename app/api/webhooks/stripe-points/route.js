import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { calculateTierAndPrice } from '@/lib/gamification'
import { recordProvenanceEvent } from '@/lib/provenance'
import { revalidatePath } from 'next/cache'

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
    event = stripe.webhooks.constructEvent(
      body, 
      signature, 
      process.env.STRIPE_WEBHOOK_SECRET_POINTS
    )
  } catch (err) {
    console.error(`❌ Error de firma Webhook: ${err.message}`)
    return NextResponse.json({ error: `Signature Error: ${err.message}` }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const metadata = session.metadata || {}

    if (metadata.type === 'POINT_PACK') {
      const { userId, artworkId, pointsAmount, packageName } = metadata
      const pointsAdded = parseInt(pointsAmount || '0', 10)
      const amountPaidMxn = session.amount_total ? session.amount_total / 100 : 0
      const customerEmail = session.customer_details?.email || 'collector@estudio.com'

      try {
        // 🟢 PASO 1: Garantizar que el usuario exista en public.users para evitar error de FK
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle()

        if (!existingUser) {
          console.log(`⚠️ Usuario ${userId} no encontrado en public.users. Creando registro base...`)
          await supabase.from('users').insert([{
            id: userId,
            email: customerEmail,
            display_name: session.customer_details?.name || 'Coleccionista',
            user_level: 1,
            user_xp: 0
          }])
        }

        // 🟢 PASO 2: Insertar en public.transactions
        const { error: txError } = await supabase
          .from('transactions')
          .insert([{
            user_id: userId,
            artwork_id: artworkId,
            package_name: packageName || 'Impulso Individual',
            points_added: pointsAdded,
            amount_paid_mxn: amountPaidMxn,
            payment_provider: 'Stripe',
            payment_intent_id: session.payment_intent,
            status: 'COMPLETED'
          }])

        if (txError) {
          console.error('❌ Error en public.transactions:', txError)
          throw txError
        }

        // 🟢 PASO 3: Actualizar u obtener public.artwork_metrics
        let { data: metrics } = await supabase
          .from('artwork_metrics')
          .select('*')
          .eq('artwork_id', artworkId)
          .maybeSingle()

        if (!metrics) {
          const { data: newMetrics, error: metricsInsertErr } = await supabase
            .from('artwork_metrics')
            .insert([{ artwork_id: artworkId, paid_points_total: 0, likes_count: 0, framed_bonus_points: 0 }])
            .select()
            .single()

          if (metricsInsertErr) {
            console.error('❌ Error creando artwork_metrics:', metricsInsertErr)
          }
          metrics = newMetrics || { likes_count: 0, paid_points_total: 0, framed_bonus_points: 0 }
        }

        const newPaidPointsTotal = (metrics.paid_points_total || 0) + pointsAdded

        // 🟢 PASO 4: Recalcular Tier e Impact Score de la obra
        const { data: artwork } = await supabase
          .from('artworks')
          .select('*')
          .eq('id', artworkId)
          .single()

        if (artwork) {
          const calculation = calculateTierAndPrice(
            artwork.base_price_mxn,
            metrics.likes_count || 0,
            newPaidPointsTotal,
            metrics.framed_bonus_points || 0
          )

          const tierChanged = calculation.currentTier !== artwork.current_tier

          // Actualizar artwork_metrics
          await supabase
            .from('artwork_metrics')
            .update({
              paid_points_total: newPaidPointsTotal,
              impact_score: calculation.impactScore,
              updated_at: new Date().toISOString()
            })
            .eq('artwork_id', artworkId)

          // Actualizar artworks
          await supabase
            .from('artworks')
            .update({
              current_tier: calculation.currentTier,
              calculated_price_mxn: calculation.calculatedPriceMxn,
              updated_at: new Date().toISOString()
            })
            .eq('id', artworkId)

          // 🟢 PASO 5: Registrar proveniencia (Protegido en try/catch independiente)
          if (tierChanged) {
            try {
              await recordProvenanceEvent({
                artworkId: artworkId,
                eventType: 'PRIMARY_SALE', // Asegurar que sea un valor válido de tu ENUM
                description: `Obra revalorizada por la comunidad a Tier ${calculation.currentTier} (Impact Score: ${calculation.impactScore}).`,
                amountMxn: calculation.calculatedPriceMxn,
                actorId: userId
              })
            } catch (provErr) {
              console.warn('⚠️ No se pudo registrar evento de proveniencia, pero se completaron los puntos:', provErr)
            }
          }

          // Revalidar caché de Next.js
          if (artwork.sku) {
            revalidatePath(`/artworks/${artwork.sku}`)
            revalidatePath(`/artwork/${artwork.sku}`)
          }
        }

        // 🟢 PASO 6: Sumar XP al usuario
        const { data: user } = await supabase
          .from('users')
          .select('user_xp')
          .eq('id', userId)
          .single()

        if (user) {
          const newXp = (user.user_xp || 0) + pointsAdded
          let newLevel = 1
          if (newXp >= 10000) newLevel = 5
          else if (newXp >= 5000) newLevel = 4
          else if (newXp >= 2000) newLevel = 3
          else if (newXp >= 500) newLevel = 2

          await supabase
            .from('users')
            .update({
              user_xp: newXp,
              user_level: newLevel,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId)
        }

        console.log(`✅ ¡Éxito! +${pointsAdded} puntos agregados a la obra ${artworkId}`)

      } catch (dbErr) {
        console.error('❌ Exception en base de datos:', dbErr)
        return NextResponse.json({ error: 'Database Exception', details: dbErr.message }, { status: 500 })
      }
    }
    if (metadata.type === 'ORDER' || metadata.orderId) {
    const amountPaidMxn = session.amount_total ? session.amount_total / 100 : 0
    const customerEmail = session.customer_details?.email

    if (customerEmail) {
      // Sumar XP a la tabla 'profiles' (1 MXN = 1 XP)
      const { data: profile } = await supabase
        .from('profiles')
        .select('xp')
        .eq('email', customerEmail)
        .maybeSingle()

      if (profile) {
        const currentXp = profile.xp || 0
        const earnedXp = Math.floor(amountPaidMxn)

        await supabase
          .from('profiles')
          .update({ 
            xp: currentXp + earnedXp,
            updated_at: new Date().toISOString()
          })
          .eq('email', customerEmail)

        console.log(`🎉 ¡Éxito! +${earnedXp} XP añadidos al perfil de ${customerEmail} por compra de obra.`)
      }
    }
  }
  }

  return NextResponse.json({ received: true })
}