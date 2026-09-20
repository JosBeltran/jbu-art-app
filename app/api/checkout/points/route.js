import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })

export async function POST(request) {
  try {
    // 🟢 Recibimos artworkSku
    const { artworkId, artworkSku, userId, pointsAmount, priceMxn, packageName } = await request.json()

    if (!artworkId || !artworkSku || !userId || !pointsAmount || !priceMxn) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos (id, sku, etc.)' }, { status: 400 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://192.168.68.106:3000'
    
    // 🟢 Usamos el SKU para la ruta
    const artworkUrl = `${baseUrl}/artwork/${artworkSku}`

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: `Impulso de Arte: ${pointsAmount} Puntos`,
              description: `Aportación comunitaria para revalorizar e impulsar la obra (IS)`,
            },
            unit_amount: Math.round(priceMxn * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // 🟢 Redirección a la ruta basada en SKU
      success_url: `${artworkUrl}?points_success=true`,
      cancel_url: `${artworkUrl}?points_canceled=true`,
      metadata: {
        type: 'POINT_PACK',
        userId,
        artworkId, // Mantenemos el UUID en metadata para que el Webhook actualice la BD correctamente
        pointsAmount: pointsAmount.toString(),
        packageName: packageName || 'Impulso Individual'
      }
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('❌ Error creando sesión de Checkout para Puntos:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}