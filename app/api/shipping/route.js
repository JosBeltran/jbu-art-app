import { getPrintShippingSettings } from '@/lib/publicPrintDetail.server'
import { publicShippingSettings } from '@/lib/shippingSettings.server'
export async function GET() {
  try {
    return Response.json(
      publicShippingSettings(await getPrintShippingSettings()),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return Response.json(
      { error: 'shipping_configuration_unavailable' },
      { status: 503 }
    )
  }
}
