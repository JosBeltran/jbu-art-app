import { serviceClient } from '@/lib/offersAuth'
import {
  deliveryAdmin,
  deliveryResponseError,
} from '@/lib/localDelivery.server'
import { deliveryKey } from '@/lib/localDeliveryInput'
const shippingStates = [
  'PENDING',
  'AWAITING_SHIPPING_LABEL',
  'SHIPPING_LABEL_RECEIVED',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'DELIVERED',
]
export async function PATCH(request, { params }) {
  try {
    const db = serviceClient()
    await deliveryAdmin(request, db)
    const { id } = await params
    deliveryKey(id)
    const body = await request.json(),
      existing = await db.from('orders').select('*').eq('id', id).single()
    if (existing.error) throw new Error('order_not_found')
    if (existing.data.payment_method === 'payment_on_delivery')
      throw new Error('use_delivery_actions')
    if (
      ![
        'PAYMENT_RECEIVED',
        'PROCESSING',
        'SHIPPED',
        'DELIVERED',
        'CANCELLED',
      ].includes(body.status)
    )
      throw new Error('invalid_status')
    const payload = {
      status: body.status,
      updated_at: new Date().toISOString(),
    }
    for (const key of [
      'courier_name',
      'tracking_number',
      'tracking_url',
      'notes',
    ]) {
      if (typeof body[key] !== 'string' || body[key].length > 2000)
        throw new Error('invalid_input')
      payload[key] = body[key]
    }
    for (const key of [
      'shipping_label_received',
      'shipping_arrangement_validated',
    ]) {
      if (body[key] === undefined) continue
      if (typeof body[key] !== 'boolean') throw new Error('invalid_input')
      payload[key] = body[key]
    }
    if (body.shipping_status !== undefined) {
      if (!shippingStates.includes(body.shipping_status))
        throw new Error('invalid_input')
      payload.shipping_status = body.shipping_status
    }
    if (body.shipping_instructions !== undefined) {
      if (
        typeof body.shipping_instructions !== 'string' ||
        body.shipping_instructions.length > 2000
      )
        throw new Error('invalid_input')
      payload.shipping_instructions = body.shipping_instructions
    }
    if (payload.tracking_url && !/^https:\/\//.test(payload.tracking_url))
      throw new Error('invalid_tracking_url')
    if (
      ['SHIPPED', 'DELIVERED'].includes(payload.status) &&
      existing.data.shipping_snapshot
    ) {
      if (
        existing.data.payment_status !== 'PAID' ||
        !(
          payload.shipping_arrangement_validated ??
          existing.data.shipping_arrangement_validated
        )
      )
        throw new Error('shipping_arrangement_not_validated')
      payload.shipping_status = payload.status
    }
    if (payload.status === 'SHIPPED' && !existing.data.shipped_at)
      payload.shipped_at = new Date().toISOString()
    if (payload.status === 'DELIVERED' && !existing.data.delivered_at)
      payload.delivered_at = new Date().toISOString()
    const result = await db
      .from('orders')
      .update(payload)
      .eq('id', id)
      .eq('status', existing.data.status)
      .select('*')
      .single()
    if (result.error || !result.data)
      throw new Error(
        result.error?.message === 'print_preparation_pending'
          ? 'print_preparation_pending'
          : 'order_save_failed'
      )
    return Response.json({ order: result.data })
  } catch (error) {
    return deliveryResponseError(error)
  }
}
