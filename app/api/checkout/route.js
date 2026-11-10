import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { userFromRequest, applicablePromotion } from '@/lib/welcomePromotion.server'
import { isArtworkPurchasable } from '@/lib/artworkStatus'
import { resolveCheckoutCurrency, unitAmountFor, chargeMetadata } from '@/lib/checkoutCurrency.server'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import { getPublicPrintArtworks } from '@/lib/publicPrintDiscovery.server'
import { publicPrintImageUrl, variantImage } from '@/lib/printImages'
import { hasPrintQuantity, isPurchasablePrintVariant } from '@/lib/catalogPrintAvailability'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(req) {
  try {
    const body = await req.json()
    const { cartItems } = body
    // A browser-supplied userId never authorizes checkout.
    const verifiedUser = await userFromRequest(req, supabase)
    if (!verifiedUser) {
      return NextResponse.json({ error: 'Se requiere iniciar sesión para este tipo de compra.' }, { status: 401 })
    }
    // Misma moneda que el comprador ve; la tasa la fija el servidor.
    const charge = await resolveCheckoutCurrency(req, body.currency)

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
    }

    if (!Array.isArray(cartItems) || cartItems.length > 30) {
      return NextResponse.json({ error: 'invalid_cart' }, { status: 400 })
    }
    if (cartItems.some(item => !['ORIGINAL', 'PRINT'].includes(String(item.type || item.item_type).toUpperCase()))) {
      return NextResponse.json({ error: 'invalid_product_type' }, { status: 400 })
    }
    const printItems = cartItems.filter(item => String(item.type || item.item_type).toUpperCase() === 'PRINT')
    const printSnapshots = new Map()
    if (printItems.length) {
      const ids = printItems.map(item => item.variantId || item.variant_id || item.print_variant_id)
      if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(String(id || '')))) {
        return NextResponse.json({ error: 'print_variant_required' }, { status: 400 })
      }
      if (new Set(ids.map(id => id.toLowerCase())).size !== ids.length) {
        return NextResponse.json({ error: 'duplicate_print_variant' }, { status: 400 })
      }
      const { data: variants, error: variantError } = await supabase.from('artwork_prints')
        .select('*').in('id', ids)
      if (variantError) return NextResponse.json({ error: 'print_variant_unavailable' }, { status: 503 })
      const artworkIds = [...new Set((variants || []).map(v => v.artwork_id))]
      const printArtworks = await getPublicPrintArtworks(artworkIds)
      if (printArtworks.length !== artworkIds.length)
        return NextResponse.json({ error: 'print_artwork_unavailable' }, { status: 400 })
      const artMap = new Map(printArtworks.map(a => [a.id, a]))
      const media = await getPrintMediaMap(supabase, printArtworks, variants || [])
      const map = new Map((variants || []).map(v => [v.id, v]))
      for (const item of printItems) {
        const variant = map.get(item.variantId || item.variant_id || item.print_variant_id)
        const id = item.id || item.artwork_id
        if (!variant || !isPurchasablePrintVariant(variant) || !artMap.has(id) || variant.artwork_id !== id ||
          !['OPEN', 'LIMITED'].includes(String(variant.edition_type).toUpperCase())) {
          return NextResponse.json({ error: 'invalid_print_variant' }, { status: 400 })
        }
        const amount = Number(variant.price)
        const quantity = Number(item.quantity ?? 1)
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
          return NextResponse.json({ error: 'invalid_print_price_or_quantity' }, { status: 400 })
        }
        if (!hasPrintQuantity(variant, quantity)) {
          return NextResponse.json({ error: 'print_edition_exhausted' }, { status: 409 })
        }
        const parent = artMap.get(id)
        item.price = amount
        item.quantity = quantity
        item.title = variant.title || parent.title
        item.sku = variant.sku || parent.sku
        item.variantId = variant.id
        printSnapshots.set(item, {
          artwork_id: id, variant_id: variant.id, size: variant.size, finish: variant.finish,
          sku: item.sku, edition_type: variant.edition_type,
        })
        // Never trust an image URL sent from the browser.
        item.image = variantImage(media[id]?.variants?.find(row => row.id === variant.id), artMap.get(id)?.primary_image_url, media[id]?.gallery)
      }
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
        .select('*')
        .in('id', originalArtworkIds)

      if (error) {
        return NextResponse.json({ error: 'Error consultando disponibilidad' }, { status: 500 })
      }

      if (dbArtworks.length !== new Set(originalArtworkIds).size) {
        return NextResponse.json({ error: 'Una de las obras ya no está disponible' }, { status: 400 })
      }

      // Fail closed: individual edition fulfillment/certificates are not yet active.
      // Never process a physical edition as a one-of-a-kind ORIGINAL.
      if (dbArtworks.some((art) => art.physical_edition_type === 'LIMITED_EDITION')) {
        return NextResponse.json(
          { error: 'Las ediciones físicas limitadas estarán disponibles próximamente.' },
          { status: 409 }
        )
      }

      const unavailable = dbArtworks.filter((art) => !isArtworkPurchasable(art))
      if (unavailable.length > 0) {
        const titles = unavailable.map((a) => a.title).join(', ')
        return NextResponse.json(
          { error: `La(s) obra(s) ya no están disponibles: ${titles}` },
          { status: 400 }
        )
      }

      // Obras en subasta abierta no se venden por el carrito normal
      const { data: openAuctions, error: auctionError } = await supabase
        .from('auctions')
        .select('artwork_id, status, sale_type, payment_status')
        .in('artwork_id', originalArtworkIds)
        .or('status.in.(UPCOMING,LIVE),and(status.eq.SOLD,payment_status.eq.PENDING)')
      if (!auctionError && openAuctions?.length) {
        return NextResponse.json({ error: 'Esta obra está en subasta. Puedes pujar desde su ficha.' }, { status: 409 })
      }

      const accepted=await supabase.from('artwork_offers').select('id').in('artwork_id',originalArtworkIds).eq('status','ACCEPTED').eq('payment_status','PENDING').gt('payment_due_at',new Date().toISOString()).limit(1)
      if(accepted.error)return NextResponse.json({error:'No se pudieron comprobar las ofertas pendientes.'},{status:503})
      if(accepted.data?.length)return NextResponse.json({error:'Esta obra tiene un pago pendiente. Completa la compra desde su ficha.'},{status:409})

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
    const mxnUnits = cartItems.map((item) => Number(item.price || item.unit_price_mxn))
    const line_items = cartItems.map((item, index) => {
      const image = item.image || item.primary_image_url
      const imageUrl = printSnapshots.has(item)
        ? publicPrintImageUrl(image, process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') || getAbsoluteImageUrl(image)
        : getAbsoluteImageUrl(image)
      const itemType = item.type || item.item_type
      const print = printSnapshots.get(item)

      return {
        price_data: {
          currency: charge.currency.toLowerCase(),
          product_data: {
            name: item.title || 'Obra de Arte',
            description: print
              ? [print.size, print.finish, print.sku].filter(Boolean).join(' · ')
              : `${itemType === 'ORIGINAL' ? 'Obra Original' : 'Fine Art Print'} — SKU: ${item.sku || 'N/A'}`,
            images: imageUrl ? [imageUrl] : [],
            ...(printItems.length ? { metadata: print || { artwork_id: getItemId(item) } } : {}),
          },
          unit_amount: unitAmountFor(mxnUnits[index], charge),
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

    // 4b. Promoción de bienvenida: se valida siempre en el servidor con el usuario verificado.
    const promo = await applicablePromotion(supabase, verifiedUser)
    let discounts
    if (promo) {
      const coupon = await stripe.coupons.create({
        percent_off: promo.percentOff,
        duration: 'once',
        max_redemptions: 1,
        name: `Bienvenida JBU ${promo.percentOff}%`,
      })
      discounts = [{ coupon: coupon.id }]
    }

    // 5. Configuración de Session
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      ...(discounts ? { discounts } : {}),
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}${printItems.length === cartItems.length ? '&print_cart=1' : ''}`,
      cancel_url: `${siteUrl}/catalog?canceled=true`,
      shipping_address_collection: {
        allowed_countries: ['MX', 'US', 'CA'],
      },
      metadata: {
        user_id: verifiedUser.id,
        ...(promo ? { welcome_promo_id: promo.id } : {}),
        ...(printItems.length ? { print_cart: 'v1' } : {
          purchased_items: JSON.stringify(itemsForMetadata), purchased_ids: JSON.stringify(originalArtworkIds),
        }),
        ...chargeMetadata(charge),
        mxn_units: JSON.stringify(mxnUnits),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Error en Checkout:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}