import { selectedCountry } from './countryAvailability.js'
export const MARKET_COOKIE = 'jbu-market'
export function cookieValue(header, name) {
  const value = String(header || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + '='))
    ?.slice(name.length + 1)
  try {
    return value ? decodeURIComponent(value) : null
  } catch {
    return null
  }
}
export const marketFromCookies = (header) =>
  selectedCountry(cookieValue(header, MARKET_COOKIE))
// Existing JBU prices remain MXN. International markets use the existing USD
// conversion, never an invented SEK/EUR price or a relabelled numeric amount.
export const marketCurrency = (country) =>
  country === 'MX' ? 'MXN' : country ? 'USD' : null
export function browsingCountry(requested, market) {
  return requested === 'ALL'
    ? null
    : selectedCountry(requested) || selectedCountry(market)
}
export function checkoutDestination(body, cookieHeader) {
  return (
    selectedCountry(
      typeof body?.destination === 'string'
        ? body.destination.trim().toUpperCase()
        : null
    ) || marketFromCookies(cookieHeader)
  )
}
