import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/offersAuth'
import { loadShippingSettings } from '@/lib/shippingSettings.server'
import { catalogCartProjection, loadFineArtVariants } from '@/lib/productCatalog/commerce.server'
import { fineArtCurrencies, isCommerceId } from '@/lib/productCatalog/commerce'
import { checkoutDestination } from '@/lib/market'

export async function POST(request) {
  try {
    const { ids, destination, currency } = await request.json()
    const country = checkoutDestination({ destination }, request.headers.get('cookie'))
    if (!Array.isArray(ids) || !ids.length || ids.length > 30 || !ids.every(isCommerceId) || !country || !fineArtCurrencies.includes(currency)) {
      return NextResponse.json({ error:'invalid_catalog_cart' }, { status:400 })
    }
    const db = serviceClient()
    const shipping = await loadShippingSettings(db)
    const variants = await loadFineArtVariants(db, shipping, { variantIds: ids })
    return NextResponse.json({ lines: variants.map(variant => catalogCartProjection(variant,country,currency)).filter(Boolean) },
      { headers:{ 'Cache-Control':'private, no-store' } })
  } catch {
    return NextResponse.json({ error:'catalog_unavailable' }, { status:503 })
  }
}
