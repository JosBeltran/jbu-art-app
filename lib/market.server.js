import { cookies } from 'next/headers'
import { browsingCountry, marketFromCookies } from './market.js'
export async function requestMarketCountry(requested) {
  return browsingCountry(
    requested,
    marketFromCookies((await cookies()).toString())
  )
}
