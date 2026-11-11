// ISO 3166-1 alpha-2. Keep validation independent of translated display names.
export const SHIPPING_COUNTRY_CODES = Object.freeze(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '))
export const DEFAULT_SHIPPING_COUNTRIES = Object.freeze(['MX', 'CA', 'US'])
const codes = new Set(SHIPPING_COUNTRY_CODES)

export function validateShippingCountries(value) {
  if (value == null) return null
  if (!Array.isArray(value) || value.some(code => typeof code !== 'string' || !codes.has(code)) ||
      new Set(value).size !== value.length) throw new Error('invalid_shipping_countries')
  return [...value]
}

export function isPhysicalItem(item) {
  return !['DIGITAL', 'DOWNLOAD', 'DIGITAL_DOWNLOAD', 'POINTS', 'CERTIFICATE'].includes(
    String(item.type || item.item_type || '').toUpperCase())
}

// Empty restrictions never narrow another physical item's destinations.
export function resolveShippingCountries(items) {
  const physical = items.filter(isPhysicalItem)
  let intersection = null
  for (const item of physical) {
    const allowed = validateShippingCountries(item.allowed_shipping_countries)
    if (!allowed?.length) continue
    intersection = intersection === null ? allowed : intersection.filter(code => allowed.includes(code))
  }
  return {
    requiresShipping: physical.length > 0,
    restricted: intersection !== null,
    countries: physical.length ? intersection ?? [...DEFAULT_SHIPPING_COUNTRIES] : [],
    compatible: intersection === null || intersection.length > 0,
  }
}

export function countryNames(countries, locale) {
  const names = new Intl.DisplayNames([locale?.startsWith('en') ? 'en' : 'es'], { type: 'region' })
  return countries.map(code => names.of(code)).join(', ')
}

export function shippingErrorText(code, t) {
  const messages = {
    shipping_country_conflict: t('Estos productos no pueden enviarse juntos. Realiza las compras por separado.', 'These products cannot be shipped together. Please purchase them separately.'),
    shipping_configuration_unavailable: t('No hay un servicio de envío configurado para estos destinos. Contacta a la galería antes de comprar.', 'Shipping is not configured for these destinations. Please contact the gallery before purchasing.'),
    invalid_shipping_countries: t('No se pudo verificar la configuración de envío. Vuelve a intentar.', 'Shipping settings could not be verified. Please try again.'),
  }
  return messages[code] || code
}
