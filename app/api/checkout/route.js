// app/api/checkout/route.js
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function POST(req) {
  try {
    const body = await req.json()
    const { cartItems } = body // Esperamos un arreglo de ítems

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
    }

    // Transformar los ítems del carrito al formato de Stripe
    const line_items = cartItems.map((item) => ({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: item.title,
          description: `${item.type === 'ORIGINAL' ? 'Obra Original' : 'Fine Art Print'} — SKU: ${item.sku || 'N/A'}`,
          images: item.image ? [item.image] : [],
        },
        unit_amount: Math.round(item.price * 100), // Stripe opera en centavos
      },
      quantity: item.quantity || 1,
    }))

    // Crear la sesión con múltiples productos
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/cart`,
      metadata: {
        // Guardamos los IDs para procesar la venta en tu DB post-pago
        artwork_ids: JSON.stringify(cartItems.map((i) => ({ id: i.id, type: i.type }))),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Error en Stripe Multi-Item Checkout API:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}