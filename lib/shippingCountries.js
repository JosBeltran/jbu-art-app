// ISO 3166-1 alpha-2 intersected with Stripe 22.6 ShippingAddressCollection.AllowedCountry.
// Excludes Stripe pseudo-codes AC/TA/XK/ZZ. Keep synchronized when upgrading Stripe.
export const SHIPPING_COUNTRY_CODES = Object.freeze(
  'AD AE AF AG AI AL AM AO AQ AR AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MK ML MM MN MO MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VN VU WF WS YE YT ZA ZM ZW'.split(
    ' '
  )
)
const codes = new Set(SHIPPING_COUNTRY_CODES)

export function validateShippingCountries(value) {
  if (value == null) return null
  if (
    !Array.isArray(value) ||
    value.some(
      (code) =>
        typeof code !== 'string' || !codes.has(code.trim().toUpperCase())
    )
  )
    throw new Error('invalid_shipping_countries')
  return [...new Set(value.map((code) => code.trim().toUpperCase()))]
}

export function isPhysicalItem(item) {
  return ![
    'DIGITAL',
    'DOWNLOAD',
    'DIGITAL_DOWNLOAD',
    'POINTS',
    'CERTIFICATE',
  ].includes(String(item.type || item.item_type || '').toUpperCase())
}

export function resolveEffectiveCountries({
  globalCountries,
  artworkCountries,
  variantCountries,
  supplierCountries,
}) {
  let result = validateShippingCountries(globalCountries) || []
  for (const restriction of [
    artworkCountries,
    variantCountries,
    supplierCountries,
  ]) {
    const allowed = validateShippingCountries(restriction)
    if (allowed?.length)
      result = result.filter((code) => allowed.includes(code))
  }
  return result
}

export function effectiveItemCountries(item, globalCountries) {
  globalCountries ??= item.effective_shipping_countries ?? []
  // Precomputed countries may be [] (unavailable), unlike an empty restriction.
  const countries = resolveEffectiveCountries({
    globalCountries,
    artworkCountries:
      item.artwork?.allowed_shipping_countries ??
      item.artwork_shipping_countries,
    variantCountries: item.allowed_shipping_countries,
    supplierCountries: item.supplier_shipping_countries,
  })
  return Array.isArray(item.effective_shipping_countries)
    ? countries.filter((code) =>
        item.effective_shipping_countries.includes(code)
      )
    : countries
}

export function resolveShippingCountries(items, globalCountries = []) {
  const physical = items.filter(isPhysicalItem)
  let countries = validateShippingCountries(globalCountries) || []
  for (const item of physical) {
    const allowed = effectiveItemCountries(item, globalCountries)
    countries = countries.filter((code) => allowed.includes(code))
  }
  return {
    requiresShipping: physical.length > 0,
    restricted: physical.some(
      (item) =>
        item.allowed_shipping_countries?.length ||
        item.artwork_shipping_countries?.length
    ),
    countries: physical.length ? countries : [],
    compatible: !physical.length || countries.length > 0,
  }
}

export function countryNames(countries, locale) {
  const names = new Intl.DisplayNames(
    [locale?.startsWith('en') ? 'en' : 'es'],
    { type: 'region' }
  )
  return countries.map((code) => names.of(code)).join(', ')
}

export function shippingErrorText(code, t) {
  const messages = {
    shipping_destination_required: t(
      'Selecciona el país de destino para calcular el envío.',
      'Select the destination country to calculate shipping.'
    ),
    shipping_quote_required: t(
      'Envío por cotizar. Solicita una cotización a la galería.',
      'Shipping quote required. Request a quote from the gallery.'
    ),
    shipping_method_conflict: t(
      'Los métodos de envío no son compatibles. Contacta a la galería.',
      'Shipping methods are incompatible. Contact the gallery.'
    ),
    shipping_destination_unsupported: t(
      'El destino seleccionado no está disponible.',
      'The selected destination is unavailable.'
    ),
    shipping_postal_code_required: t(
      'Selecciona un método sin restricción postal o contacta a la galería.',
      'Select a method without postal restrictions or contact the gallery.'
    ),
    shipping_country_conflict: t(
      'Los productos seleccionados no pueden enviarse al mismo destino.',
      'The selected products cannot be shipped to the same destination.'
    ),
    shipping_configuration_unavailable: t(
      'No hay un servicio de envío configurado para estos destinos. Contacta a la galería antes de comprar.',
      'Shipping is not configured for these destinations. Please contact the gallery before purchasing.'
    ),
    invalid_shipping_countries: t(
      'No se pudo verificar la configuración de envío. Vuelve a intentar.',
      'Shipping settings could not be verified. Please try again.'
    ),
  }
  return messages[code] || code
}
