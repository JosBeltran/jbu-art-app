import { SHIPPING_COUNTRY_CODES, effectiveItemCountries, isPhysicalItem } from './shippingCountries.js'

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

export function itemAvailableInCountry(item, country, globalCountries) {
  if (!country) return true
  if (!isPhysicalItem(item)) return matchesCountry(item?.allowed_shipping_countries, country)
  return effectiveItemCountries(item, globalCountries).includes(country)
}

export function countryOptionsForItems(_items, globalCountries = []) {
  return [...globalCountries].sort((a, b) => a.localeCompare(b))
}

/** Page slicing must happen after eligibility and other search filters. */
export function countryFilteredPage(items, country, page = 1, pageSize = 20, globalCountries) {
  const eligible = (items || []).filter(item => itemAvailableInCountry(item, country, globalCountries))
  return {
    total: eligible.length,
    items: eligible.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize),
  }
}
