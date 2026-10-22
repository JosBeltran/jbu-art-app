/** Only existing fulfillment fields may be edited; financial records never enter the payload. */
export const ORDER_STATUSES = ['PAYMENT_RECEIVED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
export const ORDER_FIELDS = ['status', 'courier_name', 'tracking_number', 'tracking_url', 'notes']

export function orderUpdate(input, current, now = new Date().toISOString()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_fields')
  if (Object.keys(input).some((key) => !ORDER_FIELDS.includes(key))) throw new Error('immutable_field')
  if (!ORDER_STATUSES.includes(input.status)) throw new Error('invalid_status')
  const payload = { status: input.status, updated_at: now }
  for (const field of ORDER_FIELDS.slice(1)) {
    if (typeof input[field] !== 'string' || input[field].length > (field === 'notes' ? 10000 : 2000)) throw new Error('invalid_fields')
    payload[field] = input[field].trim()
  }
  if (payload.tracking_url) {
    let url
    try { url = new URL(payload.tracking_url) } catch { throw new Error('invalid_tracking_url') }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid_tracking_url')
  }
  if (payload.status === 'SHIPPED' && !current.shipped_at) payload.shipped_at = now
  if (payload.status === 'DELIVERED' && !current.delivered_at) payload.delivered_at = now
  return payload
}

/** Returning rows is required: a successful HTTP update can otherwise affect zero rows under RLS. */
export async function persistOrder(db, id, input) {
  const { data: current, error: readError } = await db.from('orders').select('*').eq('id', id).maybeSingle()
  if (readError) throw Object.assign(new Error('order_read_failed'), { code: readError.code })
  if (!current) throw new Error('not_found')
  const payload = orderUpdate(input, current)
  const { data: updated, error: updateError } = await db.from('orders').update(payload).eq('id', id).select('*').maybeSingle()
  if (updateError) throw Object.assign(new Error('order_update_failed'), { code: updateError.code })
  if (!updated) throw new Error('order_not_updated')
  const { data: persisted, error: verifyError } = await db.from('orders').select('*').eq('id', id).maybeSingle()
  if (verifyError || !persisted) throw Object.assign(new Error('order_verify_failed'), { code: verifyError?.code })
  if (ORDER_FIELDS.some((field) => persisted[field] !== updated[field])) throw new Error('order_verify_failed')
  return persisted
}