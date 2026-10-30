/**
 * Moneda de visualización MXN / USD.
 *
 * La moneda base y de cobro sigue siendo MXN (Stripe cobra en MXN). USD es
 * solo una conversión aproximada para mostrar; nunca se guarda ni se envía
 * al checkout, al feed ni a los datos estructurados.
 */

export const BASE_CURRENCY = 'MXN'
export const CURRENCIES = ['MXN', 'USD']
export const CURRENCY_STORAGE_KEY = 'jbu-currency'

/** Español → MXN, inglés → USD, salvo elección manual guardada. */
export function defaultCurrency(lang, saved) {
  if (CURRENCIES.includes(saved)) return saved
  return lang === 'en' ? 'USD' : 'MXN'
}

/** Convierte un importe MXN a la moneda indicada. Sin tasa válida → null. */
export function convertFromMxn(amountMxn, currency, usdPerMxn) {
  const n = Number(amountMxn)
  if (!Number.isFinite(n)) return null
  if (currency === 'MXN') return n
  const rate = Number(usdPerMxn)
  if (currency !== 'USD' || !Number.isFinite(rate) || rate <= 0) return null
  return n * rate
}

/** «$18,900 MXN» / «$1,050 USD», sin decimales innecesarios. */
export function formatMoney(amount, currency = 'MXN', locale = 'es-MX') {
  const n = Number(amount)
  if (!Number.isFinite(n)) return ''
  const value = currency === 'USD' ? Math.round(n) : n
  const digits = Math.abs(value - Math.round(value)) < 0.005 ? 0 : 2
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  return `$${number} ${currency}`
}

/**
 * Precio de un importe MXN en la moneda elegida. Sin tasa para USD cae a MXN
 * (lo que realmente se cobra). `approximate` = mostrar aviso de tipo de cambio.
 */
export function displayPrice(amountMxn, currency, usdPerMxn, locale) {
  const converted = convertFromMxn(amountMxn, currency, usdPerMxn)
  if (converted === null) {
    return { text: formatMoney(amountMxn, BASE_CURRENCY, locale), amount: formatMoney(amountMxn, BASE_CURRENCY, locale).replace(/ MXN$/, ''), currency: BASE_CURRENCY, approximate: false }
  }
  const text = formatMoney(converted, currency, locale)
  return { text, amount: text.replace(/ (MXN|USD)$/, ''), currency, approximate: currency !== BASE_CURRENCY }
}
