import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { buyerName, buyerPhone, selectedArtworks } = await request.json()

    if (!buyerName || !selectedArtworks || selectedArtworks.length === 0) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos.' },
        { status: 400 }
      )
    }

    // Cliente con privilegios administrativos (bypasa RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const totalAmount = selectedArtworks.reduce(
      (acc: number, art: any) => acc + Number(art.price || 0),
      0
    )

    // 1. Crear la Orden
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .insert({
        buyer_name: buyerName,
        buyer_email: 'venta_directa@estudiojbu.com',
        buyer_phone: buyerPhone || null,
        shipping_address: { type: 'entrega_directa', note: 'Venta física/directa en estudio' },
        total_amount_mxn: totalAmount,
        status: 'PAYMENT_RECEIVED',
        notes: `Lote de Reclamo Directo para: ${buyerName}`
      })
      .select()
      .single()

    if (orderErr) throw new Error(`Order Error: ${orderErr.message}`)

    // 2. Crear el Grupo de Reclamo
    const { data: group, error: groupErr } = await supabaseAdmin
      .from('claim_groups')
      .insert({
        buyer_name: buyerName,
        buyer_phone: buyerPhone || null
      })
      .select()
      .single()

    if (groupErr) throw new Error(`Group Error: ${groupErr.message}`)

    // 3. Crear los Order Items
    const orderItemsToInsert = selectedArtworks.map((art: any) => ({
      order_id: order.id,
      artwork_id: art.id,
      claim_group_id: group.id,
      title_snapshot: art.title,
      sku_snapshot: art.sku || art.id.substring(0, 8),
      unit_price_mxn: Number(art.price || 0),
      quantity: 1,
      is_claimed: false
    }))

    const { error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .insert(orderItemsToInsert)

    if (itemsErr) throw new Error(`Items Error: ${itemsErr.message}`)

    return NextResponse.json({ success: true, group_token: group.group_token })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}