import {
  validateShippingCountries,
  resolveShippingCountries,
  isPhysicalItem,
} from './shippingCountries.js'
import { chargeFor } from './currency.js'

export const SHIPPING_METHODS = [
  'INCLUDED',
  'FIXED_RATE',
  'LOCAL_DELIVERY',
  'LOCAL_PICKUP',
  'BUYER_ARRANGED',
  'QUOTE_REQUIRED',
]
export const SHIPPING_PROVIDERS = ['ARTIST', 'PRODIGI', 'EXTERNAL', 'BUYER']
export const SHIPPING_CATEGORIES = [
  'original',
  'open_print',
  'limited_print',
  'physical',
  'supplier',
]
export const SHIPPING_STRATEGIES = ['PER_ITEM', 'PER_ORDER', 'PER_PROVIDER']
const uuid = (value) =>
  typeof value === 'string' &&
  /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
export function validatePolicyIds(value) {
  if (value == null) return null
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some((id) => !uuid(id))
  )
    throw new Error('invalid_shipping_policy')
  return [...new Set(value)]
}
export function validateShippingPolicy(input) {
  const fail = () => {
    throw new Error('invalid_shipping_policy')
  }
  if (
    !input ||
    !uuid(input.id) ||
    !SHIPPING_METHODS.includes(input.method) ||
    !SHIPPING_PROVIDERS.includes(input.fulfillment_provider) ||
    !SHIPPING_STRATEGIES.includes(input.strategy) ||
    typeof input.active !== 'boolean' ||
    typeof input.insurance_required !== 'boolean'
  )
    fail()
  const out = {
    id: input.id,
    method: input.method,
    fulfillment_provider: input.fulfillment_provider,
    strategy: input.strategy,
    active: input.active,
    insurance_required: input.insurance_required,
  }
  for (const key of [
    'name',
    'name_en',
    'name_es',
    'notes',
    'instructions_en',
    'instructions_es',
  ]) {
    if (
      typeof input[key] !== 'string' ||
      input[key].length > (key === 'notes' ? 4000 : 500)
    )
      fail()
    out[key] = input[key].trim()
  }
  if (
    !out.name ||
    !out.name_en ||
    !out.name_es ||
    out.name_en.length > 100 ||
    out.name_es.length > 100
  )
    fail()
  out.countries = validateShippingCountries(input.countries) || []
  // Base and charged currency follow JBU's existing MXN / USD conversion utility.
  if (
    input.currency !== 'MXN' ||
    !Number.isSafeInteger(input.amount_minor) ||
    input.amount_minor < 0 ||
    input.amount_minor > 99999999
  )
    fail()
  if (input.method === 'INCLUDED' && input.amount_minor !== 0) fail()
  out.currency = 'MXN'
  out.amount_minor = input.amount_minor
  for (const key of ['minimum_days', 'maximum_days']) {
    if (
      input[key] != null &&
      (!Number.isInteger(input[key]) || input[key] < 1 || input[key] > 365)
    )
      fail()
    out[key] = input[key] ?? null
  }
  if (
    (out.minimum_days == null) !== (out.maximum_days == null) ||
    out.minimum_days > out.maximum_days ||
    input.delivery_unit !== 'business_day'
  )
    fail()
  out.delivery_unit = 'business_day'
  if (
    !Array.isArray(input.postal_codes) ||
    input.postal_codes.some(
      (code) => typeof code !== 'string' || !/^[A-Za-z\d -]{1,16}$/.test(code)
    )
  )
    fail()
  if (input.postal_codes.length && input.method !== 'LOCAL_DELIVERY') fail()
  out.postal_codes = [...new Set(input.postal_codes)]
  return out
}
export function validateShippingDefaults(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !SHIPPING_CATEGORIES.includes(key))
  )
    throw new Error('invalid_shipping_policy')
  return Object.fromEntries(
    SHIPPING_CATEGORIES.map((key) => [key, validatePolicyIds(value[key]) || []])
  )
}
export function shippingCategory(item) {
  if (
    item.fulfillment_provider &&
    !['ARTIST', 'BUYER'].includes(item.fulfillment_provider)
  )
    return 'supplier'
  if (String(item.type).toUpperCase() === 'PRINT')
    return String(item.edition_type).toUpperCase() === 'OPEN'
      ? 'open_print'
      : 'limited_print'
  return String(item.type).toUpperCase() === 'ORIGINAL'
    ? 'original'
    : 'physical'
}
export function itemPolicyIds(item, defaults) {
  if (item.shipping_policy_ids?.length) return item.shipping_policy_ids
  if (item.artwork?.shipping_policy_ids?.length)
    return item.artwork.shipping_policy_ids
  return defaults[shippingCategory(item)] || []
}
const signature = (options) => JSON.stringify(options)
function optionsForCountry(items, policies, defaults, country, locale, charge) {
  let combinations = [[]]
  for (const item of items) {
    const assigned = itemPolicyIds(item, defaults)
    const choices = policies.filter(
      (p) =>
        assigned.includes(p.id) &&
        p.active &&
        (!p.countries.length || p.countries.includes(country))
    )
    if (!choices.length) throw new Error('shipping_configuration_unavailable')
    const payable = choices.filter(
      (p) => p.method !== 'QUOTE_REQUIRED' && !p.postal_codes?.length
    )
    if (!payable.length)
      throw new Error(
        choices.some((p) => p.method === 'QUOTE_REQUIRED')
          ? 'shipping_quote_required'
          : 'shipping_postal_code_required'
      )
    const quantity = Number(item.quantity ?? 1)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100)
      throw new Error('invalid_shipping_quantity')
    combinations = combinations.flatMap((groups) =>
      payable.map((policy) => [
        ...groups,
        { policy, quantity, item_id: item.id },
      ])
    )
    if (combinations.length > 100) throw new Error('shipping_method_conflict')
  }
  const options = []
  for (const combination of combinations) {
    const methods = new Set(
      combination.map((g) => g.policy.method).filter((m) => m !== 'INCLUDED')
    )
    // Delivery, pickup and buyer collection cannot be mixed with shipped parcels.
    if (
      methods.size > 1 ||
      (combination.some((g) => g.policy.method === 'INCLUDED') &&
        [...methods].some((m) =>
          ['LOCAL_PICKUP', 'BUYER_ARRANGED', 'LOCAL_DELIVERY'].includes(m)
        ))
    )
      continue
    const groups = new Map()
    for (const { policy, quantity } of combination) {
      const key = policy.id + ':' + policy.fulfillment_provider
      const previous = groups.get(key)
      const multiplier =
        policy.strategy === 'PER_ITEM' ? quantity : previous ? 0 : 1
      const snapshotPolicy = { ...policy }
      delete snapshotPolicy.notes
      groups.set(key, {
        policy: snapshotPolicy,
        amount_minor:
          (previous?.amount_minor || 0) + policy.amount_minor * multiplier,
        quantity: (previous?.quantity || 0) + quantity,
      })
    }
    const rows = [...groups.values()].sort((a, b) =>
      a.policy.id.localeCompare(b.policy.id)
    )
    const amountMxnMinor = rows.reduce((sum, g) => sum + g.amount_minor, 0)
    const amount = chargeFor(
      amountMxnMinor / 100,
      charge.currency,
      charge.usdPerMxn
    ).cents
    const names = [
      ...new Set(
        rows.map((g) => (locale === 'en' ? g.policy.name_en : g.policy.name_es))
      ),
    ]
    const allEstimates = rows.every(
      (g) => g.policy.minimum_days != null && g.policy.maximum_days != null
    )
    const option = {
      displayName: names.join(' + ').slice(0, 100),
      amount,
      currency: charge.currency.toLowerCase(),
      amountMxnMinor,
      minimumDays: allEstimates
        ? Math.max(...rows.map((g) => g.policy.minimum_days))
        : null,
      maximumDays: allEstimates
        ? Math.max(...rows.map((g) => g.policy.maximum_days))
        : null,
      method: [...methods][0] || 'INCLUDED',
      groups: rows,
    }
    if (!options.some((existing) => signature(existing) === signature(option)))
      options.push(option)
  }
  if (!options.length || options.length > 5)
    throw new Error('shipping_method_conflict')
  return options
}

/** Pure resolver shared by preview and authoritative checkout. No client prices. */
export function resolveCartShipping({
  items,
  globalCountries,
  defaults,
  policies,
  destination,
  locale = 'es',
  charge = { currency: 'MXN' },
}) {
  const physical = items.filter(isPhysicalItem)
  if (!physical.length) return { countries: [], options: [] }
  const resolved = resolveShippingCountries(physical, globalCountries)
  if (!resolved.compatible) throw new Error('shipping_country_conflict')
  if (destination && !resolved.countries.includes(destination))
    throw new Error('shipping_destination_unsupported')
  const byCountry = new Map()
  let firstError
  for (const country of resolved.countries) {
    try {
      byCountry.set(
        country,
        optionsForCountry(physical, policies, defaults, country, locale, charge)
      )
    } catch (error) {
      firstError ||= error
    }
  }
  if (destination) {
    if (!byCountry.has(destination))
      throw firstError || new Error('shipping_configuration_unavailable')
    return { countries: [destination], options: byCountry.get(destination) }
  }
  if (!byCountry.size)
    throw firstError || new Error('shipping_configuration_unavailable')
  const options = [...byCountry.values()][0]
  if (
    byCountry.size !== resolved.countries.length ||
    [...byCountry.values()].some(
      (value) => signature(value) !== signature(options)
    )
  ) {
    const error = new Error('shipping_destination_required')
    error.countries = [...byCountry.keys()]
    throw error
  }
  return { countries: resolved.countries, options }
}
