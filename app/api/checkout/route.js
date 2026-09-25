import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(req) {
  try {
    const body = await req.json()
    const { cartItems, userId } = body

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
    }

    // Helper para extraer ID sin importar cómo venga del frontend
    const getItemId = (item) => item.id || item.artwork_id || item.artworkId || item._id

    // 1. Filtrar solo IDs válidos de Obras Originales presentes en el carrito
    const originalArtworkIds = cartItems
      .filter((item) => (item.type === 'ORIGINAL' || item.item_type === 'ORIGINAL') && getItemId(item))
      .map((item) => getItemId(item))

    // 2. Validar que las obras sigan AVAILABLE
    if (originalArtworkIds.length > 0) {
      const { data: dbArtworks, error } = await supabase
        .from('artworks')
        .select('id, title, ownership_status, base_price_mxn, calculated_price_mxn')
        .in('id', originalArtworkIds)

      if (error) {
        return NextResponse.json({ error: 'Error consultando disponibilidad' }, { status: 500 })
      }

      if (dbArtworks.length !== new Set(originalArtworkIds).size) {
        return NextResponse.json({ error: 'Una de las obras ya no está disponible' }, { status: 400 })
      }

      const unavailable = dbArtworks.filter((art) => art.ownership_status !== 'AVAILABLE')
      if (unavailable.length > 0) {
        const titles = unavailable.map((a) => a.title).join(', ')
        return NextResponse.json(
          { error: `La(s) obra(s) ya no están disponibles: ${titles}` },
          { status: 400 }
        )
      }

      // El precio y el título de una obra original siempre proceden del catálogo,
      // nunca de los datos enviados por el navegador.
      const originalById = new Map(dbArtworks.map((art) => [art.id, art]))
      for (const item of cartItems) {
        if (item.type !== 'ORIGINAL' && item.item_type !== 'ORIGINAL') continue
        const original = originalById.get(getItemId(item))
        const amount = Number(original?.base_price_mxn || original?.calculated_price_mxn || 0)
        if (!original || !Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json({ error: 'Esta obra no tiene un precio de compra válido' }, { status: 400 })
        }
        item.price = amount
        item.title = original.title
        item.quantity = 1
      }
    }

    // Helper para asegurar URL absoluta para Stripe
    const getAbsoluteImageUrl = (img) => {
      if (!img) return null
      if (img.startsWith('http://') || img.startsWith('https://')) return img
      return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${img}`
    }

    // 3. Crear line_items para Stripe
    const line_items = cartItems.map((item) => {
      const imageUrl = getAbsoluteImageUrl(item.image || item.primary_image_url)
      const itemType = item.type || item.item_type

      return {
        price_data: {
          currency: 'mxn',
          product_data: {
            name: item.title || 'Obra de Arte',
            description: `${itemType === 'ORIGINAL' ? 'Obra Original' : 'Fine Art Print'} — SKU: ${item.sku || 'N/A'}`,
            images: imageUrl ? [imageUrl] : [],
          },
          unit_amount: Math.round(Number(item.price || item.unit_price_mxn) * 100),
        },
        quantity: Number(item.quantity) || 1,
      }
    })

    // 4. Mapear items compactos para Stripe Metadata (para no superar límite de caracteres)
    const itemsForMetadata = cartItems.map((item) => ({
      id: getItemId(item),
      type: (item.type || item.item_type) === 'PRINT' ? 'PRINT' : 'ORIGINAL',
      variant_id: item.variantId || item.variant_id || null
    }))

    // 5. Configuración de Session
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/catalog?canceled=true`,
      shipping_address_collection: {
        allowed_countries: ['MX', 'US', 'CA'],
      },
      metadata: {
        user_id: userId || 'anonymous',
        purchased_items: JSON.stringify(itemsForMetadata),
        purchased_ids: JSON.stringify(originalArtworkIds),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Error en Checkout:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}