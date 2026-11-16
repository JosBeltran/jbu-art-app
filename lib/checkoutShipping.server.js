import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { resolveCartShipping } from './shippingPolicies.js'
import { loadShippingSettings } from './shippingSettings.server.js'

export function shippingIntegrationIdentifier(seed = randomBytes(16)) {
  const suffix = Array.from(
    createHash('sha256').update(seed).digest().subarray(0, 8),
    (byte) => String.fromCharCode(97 + (byte % 26))
  ).join('')
  return 'jbu-shipping-' + suffix
}

export function checkoutShipping(authoritativeItems, config, context = {}) {
  if (!config) throw new Error('shipping_configuration_unavailable')
  return resolveCartShipping({
    items: authoritativeItems,
    ...config,
    ...context,
  })
}

// Persist the server-calculated manifest before exposing a Stripe session.
export async function prepareCheckoutShipping(
  db,
  authoritativeItems,
  request,
  body = {},
  charge = { currency: 'MXN' },
  preparationKey = null
) {
  const config = await loadShippingSettings(db)
  const cookieLocale = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)jbu-lang=(en|es)(?:;|$)/)?.[1]
  const locale = ['en', 'es'].includes(body.locale)
    ? body.locale
    : cookieLocale ||
      (/^en/i.test(request.headers.get('accept-language') || '') ? 'en' : 'es')
  const destination =
    typeof body.destination === 'string'
      ? body.destination.trim().toUpperCase()
      : null
  const resolved = checkoutShipping(authoritativeItems, config, {
    destination,
    locale,
    charge,
  })
  if (!resolved.options.length) return {}
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ resolved, revision: config.revision }))
    .digest('hex')
  const hex = preparationKey
    ? createHash('sha256')
        .update(preparationKey + ':' + fingerprint)
        .digest('hex')
    : null
  const manifestId = hex
    ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
    : randomUUID()
  const { data, error } = await db.rpc('prepare_shipping_checkout', {
    _id: manifestId,
    _countries: resolved.countries,
    _options: resolved.options,
    _revision: config.revision,
    _fingerprint: fingerprint,
  })
  if (error || !data) throw new Error('shipping_configuration_unavailable')
  return {
    shipping_address_collection: { allowed_countries: resolved.countries },
    shipping_options: resolved.options.map((option, index) => ({
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: option.displayName,
        fixed_amount: { amount: option.amount, currency: option.currency },
        metadata: {
          jbu_shipping_checkout: data.id,
          jbu_shipping_option: String(index),
        },
        ...(option.minimumDays != null
          ? {
              delivery_estimate: {
                minimum: { unit: 'business_day', value: option.minimumDays },
                maximum: { unit: 'business_day', value: option.maximumDays },
              },
            }
          : {}),
      },
    })),
    metadata: {
      jbu_shipping_checkout: data.id,
      jbu_shipping_fingerprint: fingerprint,
    },
  }
}
export function shippingErrorStatus(error) {
  if (
    [
      'shipping_country_conflict',
      'shipping_destination_required',
      'shipping_destination_unsupported',
      'shipping_method_conflict',
      'shipping_quote_required',
      'shipping_postal_code_required',
    ].includes(error?.message)
  )
    return 409
  return [
    'shipping_configuration_unavailable',
    'invalid_shipping_countries',
    'invalid_shipping_policy',
  ].includes(error?.message)
    ? 503
    : null
}
// Fingerprint covers rates, estimates, policy snapshots and destinations. Old
// sessions without one are never reused after this migration.
export function sessionHasShipping(session, shipping) {
  const expected = shipping.shipping_address_collection?.allowed_countries || []
  const actual = session.shipping_address_collection?.allowed_countries || []
  return (
    expected.length === actual.length &&
    expected.every((code) => actual.includes(code)) &&
    (session.metadata?.jbu_shipping_fingerprint || null) ===
      (shipping.metadata?.jbu_shipping_fingerprint || null)
  )
}
export async function bindCheckoutShipping(db, session, shipping) {
  if (!shipping.metadata?.jbu_shipping_checkout) return
  const { error, data } = await db.rpc('bind_shipping_checkout', {
    _id: shipping.metadata.jbu_shipping_checkout,
    _session: session.id,
  })
  if (error || data !== true) throw new Error('shipping_session_binding_failed')
}
