import { getMerchantFeedData } from '@/lib/googleMerchant.data'
import { buildMerchantFeed } from '@/lib/googleMerchant'

// Merchant Center recibe datos frescos sin consultar Supabase en cada petición.
export const revalidate = 3600

/**
 * Feed público de productos para Google Merchant Center.
 * RSS 2.0 + namespace Google Merchant, generado dinámicamente desde las
 * obras existentes. Sin autenticación, sin HTML, sin secretos.
 */
export async function GET() {
  let feed
  try {
    const { items } = await getMerchantFeedData()
    feed = buildMerchantFeed(items)
  } catch (error) {
    console.error('Google Merchant feed failed:', error)
    feed = buildMerchantFeed([])
  }
  return new Response(feed, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
