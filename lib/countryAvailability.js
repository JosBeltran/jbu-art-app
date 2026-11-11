import { DEFAULT_SHIPPING_COUNTRIES, SHIPPING_COUNTRY_CODES } from './shippingCountries.js'

const validCodes = new Set(SHIPPING_COUNTRY_CODES)

/** All Countries is represented by null, never as an ISO code. */
export function selectedCountry(value) {
  return typeof value === 'string' && validCodes.has(value) ? value : null
}

export function matchesCountry(restrictions, country) {
  if (!country) return true
  // NULL and [] mean no per-item destination restriction.
  return restrictions == null || (Array.isArray(restrictions) &&
    (restrictions.length === 0 || restrictions.includes(country)))
}

export function itemAvailableInCountry(item, country) {
  return matchesCountry(item?.allowed_shipping_countries, country)
}

export function countryOptionsForItems(items) {
  const set = new Set(DEFAULT_SHIPPING_COUNTRIES)
  for (const item of items || []) {
    for (const code of item?.allowed_shipping_countries || []) {
      if (validCodes.has(code)) set.add(code)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** Page slicing must happen after eligibility and other search filters. */
export function countryFilteredPage(items, country, page = 1, pageSize = 20) {
  const eligible = (items || []).filter(item => itemAvailableInCountry(item, country))
  return {
    total: eligible.length,
    items: eligible.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize),
  }
}
