import {
  validateShippingCountries,
  effectiveItemCountries,
} from './shippingCountries.js'
import { validateShippingDefaults } from './shippingPolicies.js'

// Read on each request: settings changes affect the next checkout immediately.
export async function loadShippingSettings(db) {
  const [settings, policies] = await Promise.all([
    db
      .from('site_settings')
      .select(
        'global_shipping_countries,default_shipping_policies,shipping_revision'
      )
      .eq('id', true)
      .single(),
    db.from('shipping_policies').select('*').order('id'),
  ])
  if (settings.error || policies.error || !settings.data)
    throw new Error('shipping_configuration_unavailable')
  return {
    globalCountries:
      validateShippingCountries(settings.data.global_shipping_countries) || [],
    defaults: validateShippingDefaults(settings.data.default_shipping_policies),
    policies: policies.data || [],
    revision: settings.data.shipping_revision,
  }
}
export function publicShippingSettings(config) {
  return {
    ...config,
    policies: config.policies.map((row) => {
      const policy = { ...row }
      delete policy.notes
      return policy
    }),
  }
}
export function withShippingCountries(item, config, artwork = null) {
  const row = artwork ? { ...item, artwork } : item
  return {
    ...item,
    ...(artwork
      ? { artwork_shipping_countries: artwork.allowed_shipping_countries }
      : {}),
    effective_shipping_countries: effectiveItemCountries(
      row,
      config.globalCountries
    ),
  }
}
