import { NextResponse } from 'next/server'
import { authorizeOrderAdmin } from '@/lib/adminOrders.server'
import { persistOrder } from '@/lib/orderOperations'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
const invalid = ['invalid_fields', 'immutable_field', 'invalid_status', 'invalid_tracking_url']

export function createOrderHandlers(authorize = authorizeOrderAdmin) {
  return {
    async GET(request) {
      try {
        const access = await authorize(request)
        if (access.error) return NextResponse.json({ error: access.error }, { status: access.status, headers })
        const { data, error } = await access.db.from('orders')
          .select('*, order_items(id, title_snapshot, sku_snapshot, unit_price_mxn, quantity, claim_token_snapshot)')
          .order('created_at', { ascending: false })
        if (error) {
          console.error('Admin orders list:', { code: error.code })
          return NextResponse.json({ error: 'order_read_failed', code: error.code }, { status: 500, headers })
        }
        return NextResponse.json({ orders: data || [] }, { headers })
      } catch {
        return NextResponse.json({ error: 'order_read_failed' }, { status: 500, headers })
      }
    },
    async PATCH(request) {
      try {
        const access = await authorize(request)
        if (access.error) return NextResponse.json({ error: access.error }, { status: access.status, headers })
        const body = await request.json().catch(() => null)
        if (!body || typeof body.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.id)) {
          return NextResponse.json({ error: 'invalid_fields' }, { status: 400, headers })
        }
        const { id, ...input } = body
        const order = await persistOrder(access.db, id, input)
        return NextResponse.json({ order }, { headers })
      } catch (error) {
        const status = invalid.includes(error.message) ? 400 : error.message === 'not_found' ? 404 : 500
        console.error('Admin order update:', { reason: error.message, code: error.code })
        return NextResponse.json({ error: error.message, code: error.code }, { status, headers })
      }
    },
  }
}

const handlers = createOrderHandlers()
export const GET = handlers.GET
export const PATCH = handlers.PATCH