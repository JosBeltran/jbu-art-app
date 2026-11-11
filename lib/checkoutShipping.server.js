import { DEFAULT_SHIPPING_COUNTRIES, resolveShippingCountries, validateShippingCountries } from './shippingCountries.js'
import { createHash, randomBytes } from 'node:crypto'

export function shippingIntegrationIdentifier(seed = randomBytes(16)) {
  const suffix = Array.from(createHash('sha256').update(seed).digest().subarray(0, 8), byte => String.fromCharCode(97 + byte % 26)).join('')
  return 'jbu-shipping-' + suffix
}

// Existing Checkout charges product prices with shipping included (no shipping
// rates or provider API). Coverage is operational configuration, never inferred
// from a product restriction. Additional destinations require explicit opt-in.
export function checkoutShipping(authoritativeItems, coverage = process.env.JBU_INCLUDED_SHIPPING_COUNTRIES) {
  const result = resolveShippingCountries(authoritativeItems)
  if (!result.compatible) throw new Error('shipping_country_conflict')
  if (!result.requiresShipping) return {}
  let included
  try {
    included = coverage == null ? DEFAULT_SHIPPING_COUNTRIES : validateShippingCountries(coverage.split(',').map(code => code.trim()))
  } catch { throw new Error('shipping_configuration_unavailable') }
  if (!result.countries.every(code => included.includes(code))) throw new Error('shipping_configuration_unavailable')
  return { shipping_address_collection: { allowed_countries: result.countries } }
}

export function shippingErrorStatus(error) {
  return error?.message === 'shipping_country_conflict' ? 409 :
    ['shipping_configuration_unavailable', 'invalid_shipping_countries'].includes(error?.message) ? 503 : null
}

// Reused sessions must enforce today's authoritative destinations as well.
export function sessionHasShipping(session, shipping) {
  const expected = shipping.shipping_address_collection?.allowed_countries || []
  const actual = session.shipping_address_collection?.allowed_countries || []
  return expected.length === actual.length && expected.every(code => actual.includes(code))
}
