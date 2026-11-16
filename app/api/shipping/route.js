import { serviceClient } from '@/lib/offersAuth'
import {
  loadShippingSettings,
  publicShippingSettings,
} from '@/lib/shippingSettings.server'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    return Response.json(
      publicShippingSettings(await loadShippingSettings(serviceClient())),
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch {
    return Response.json(
      { error: 'shipping_configuration_unavailable' },
      { status: 503 }
    )
  }
}
