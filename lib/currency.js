/**
 * Moneda de visualización MXN / USD.
 *
 * Los precios se guardan en MXN. Si el comprador elige USD, Stripe cobra en
 * USD exactamente el importe mostrado (dólares enteros, misma tasa del
 * servidor). El feed y los datos estructurados siguen en MXN.
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

/**
 * Importe que se cobra en Stripe para un precio MXN. USD se redondea a
 * dólares enteros, igual que se muestra. Sin tasa válida → MXN.
 */
export function chargeFor(amountMxn, currency, usdPerMxn) {
  const n = Number(amountMxn)
  if (!Number.isFinite(n) || n < 0) return { currency: BASE_CURRENCY, cents: null }
  const rate = Number(usdPerMxn)
  if (currency === 'USD' && Number.isFinite(rate) && rate > 0) {
    return { currency: 'USD', cents: Math.round(n * rate) * 100 }
  }
  return { currency: BASE_CURRENCY, cents: Math.round(n * 100) }
}

/**
 * Total de un carrito tal como lo cobra Stripe: cada partida se convierte y
 * redondea por separado, así el total mostrado es la suma exacta cobrada.
 */
export function displayTotal(items, currency, usdPerMxn, locale) {
  const list = Array.isArray(items) ? items : []
  const mxn = list.reduce((acc, i) => acc + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0)
  const base = displayPrice(mxn, currency, usdPerMxn, locale)
  if (base.currency !== 'USD') return base
  const cents = list.reduce((acc, i) => acc + (chargeFor(Number(i.price) || 0, 'USD', usdPerMxn).cents || 0) * (Number(i.quantity) || 1), 0)
  const text = formatMoney(cents / 100, 'USD', locale)
  return { ...base, text, amount: text.replace(/ USD$/, '') }
}
