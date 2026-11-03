import { CURRENCIES, CURRENCY_STORAGE_KEY, chargeFor } from '@/lib/currency'
import { getUsdPerMxn } from '@/lib/fxRate.server'

/** Moneda elegida por el comprador (cuerpo o cookie); la tasa siempre la decide el servidor. */
export async function resolveCheckoutCurrency(request, requested) {
  let wanted = typeof requested === 'string' ? requested.toUpperCase() : null
  if (!CURRENCIES.includes(wanted)) {
    const cookie = request.headers.get('cookie') || ''
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${CURRENCY_STORAGE_KEY}=([A-Za-z]{3})`))
    wanted = match ? match[1].toUpperCase() : 'MXN'
  }
  if (wanted !== 'USD') return { currency: 'MXN', usdPerMxn: null }
  const { usdPerMxn } = await getUsdPerMxn()
  // Sin tasa válida se cobra MXN, que es también lo que la pantalla muestra en ese caso.
  return usdPerMxn ? { currency: 'USD', usdPerMxn } : { currency: 'MXN', usdPerMxn: null }
}

/** Importe en centavos de la moneda de cobro para un precio MXN. */
export const unitAmountFor = (amountMxn, charge) => chargeFor(amountMxn, charge.currency, charge.usdPerMxn).cents

/** Metadata común para que el webhook reconstruya los importes MXN. */
export const chargeMetadata = (charge) => ({ charge_currency: charge.currency, ...(charge.usdPerMxn ? { fx_usd_per_mxn: String(charge.usdPerMxn) } : {}) })
