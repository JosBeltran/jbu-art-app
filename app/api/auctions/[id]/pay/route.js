import { NextResponse } from 'next/server'
import { createAuctionCheckout } from '@/lib/auctionCheckout.server'

export async function POST(request, { params }) {
  try {
    const { id } = await params
    const result = await createAuctionCheckout(request, id, 'BID')
    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('Error en pago de subasta:', err)
    return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 500 })
  }
}
