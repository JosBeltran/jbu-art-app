// Misma tasa que usa el checkout (lib/fxRate.server.js), para que lo mostrado coincida con lo cobrado.
import { getUsdPerMxn } from '@/lib/fxRate.server'

export const revalidate = 43200

export async function GET() {
  const { usdPerMxn, source } = await getUsdPerMxn()
  return Response.json({ base: 'MXN', usdPerMxn, source }, { headers: { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400' } })
}
