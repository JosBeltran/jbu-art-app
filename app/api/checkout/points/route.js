import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { chargeMetadata, resolveCheckoutCurrency, unitAmountFor } from '@/lib/checkoutCurrency.server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })

// El servidor es la fuente de verdad del precio. El navegador solo elige el tier.
const BOOST_PACKAGES = {
  500: { priceMxn: 50, defaultName: 'Impulso Bronce' },
  1200: { priceMxn: 100, defaultName: 'Impulso Plata' },
  2500: { priceMxn: 200, defaultName: 'Impulso Oro' }
}

export async function POST(request) {
  try {
    const { artworkId, artworkSku, userId, pointsAmount, packageName, currency, lang } = await request.json()
    const points = Number(pointsAmount)
    const boostPackage = BOOST_PACKAGES[points]

    if (!artworkId || !artworkSku || !userId || !boostPackage) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos o el paquete no es válido' }, { status: 400 })
    }

    const checkoutLocale = lang === 'en' ? 'en' : 'es'
    const charge = await resolveCheckoutCurrency(request, currency)
    const unitAmount = unitAmountFor(boostPackage.priceMxn, charge)
    if (!Number.isInteger(unitAmount) || unitAmount <= 0) {
      return NextResponse.json({ error: 'No fue posible calcular el importe del impulso' }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://192.168.68.106:3000'
    const artworkUrl = `${baseUrl}/artwork/${artworkSku}`
    const isEnglish = checkoutLocale === 'en'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      locale: checkoutLocale,
      line_items: [
        {
          price_data: {
            currency: charge.currency.toLowerCase(),
            product_data: {
              name: isEnglish
                ? `Art Boost: ${points.toLocaleString('en-US')} Points`
                : `Impulso de Arte: ${points.toLocaleString('es-MX')} Puntos`,
              description: isEnglish
                ? 'Community support to boost this artwork and its impact.'
                : 'Aportación comunitaria para revalorizar e impulsar la obra.',
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${artworkUrl}?points_success=true`,
      cancel_url: `${artworkUrl}?points_canceled=true`,
      metadata: {
        type: 'POINT_PACK',
        userId,
        artworkId,
        pointsAmount: points.toString(),
        packageName: packageName || boostPackage.defaultName,
        base_price_mxn: String(boostPackage.priceMxn),
        checkout_locale: checkoutLocale,
        ...chargeMetadata(charge)
      }
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('❌ Error creando sesión de Checkout para Puntos:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}