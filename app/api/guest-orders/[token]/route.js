import { createHash } from 'node:crypto'
import { serviceClient } from '@/lib/offersAuth'

const NO_STORE = { 'Cache-Control': 'no-store' }

// The 256-bit token is independently generated during checkout and emailed
// after payment. An order UUID alone never authorizes access.
export async function GET(request, { params }) {
  const { token } = await params
  if (!/^[a-f0-9]{64}$/.test(token || '')) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
  try {
    const hash = createHash('sha256').update(token).digest('hex')
    const db = serviceClient()
    const { data: access, error } = await db.from('guest_open_print_checkouts')
      .select('order_id').eq('token_hash', hash).not('order_id','is', null).maybeSingle()
    if (error || !access?.order_id) return Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE })
    const { data: order, error: orderError } = await db.from('orders')
      .select('id,status,production_status,charged_currency,charged_amount,total_amount_mxn,tracking_number,tracking_url,courier_name')
      .eq('id', access.order_id).maybeSingle()
    const { data: items, error: itemError } = await db.from('order_items')
      .select('title_snapshot,sku_snapshot,quantity,unit_price_mxn,print_variant_id,print_size_snapshot,print_finish_snapshot')
      .eq('order_id', access.order_id)
    if (orderError || itemError || !order || !items) throw new Error('order_read_failed')
    return Response.json({ order, items }, { headers: NO_STORE })
  } catch (error) {
    console.error('[guest-orders] read failed', { reason: error.message })
    return Response.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE })
  }
}
