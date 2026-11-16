'use client'
import { useShipping } from './ShippingProvider'
import { useMarket } from '@/components/market/MarketProvider'
import { useCurrency } from '@/components/CurrencyProvider'
import { useI18n } from '@/components/I18nProvider'
import { resolveCartShipping } from '@/lib/shippingPolicies'
export function usePurchaseShipping(item, destination) {
  const config = useShipping(),
    market = useMarket(),
    { chargeCurrency, usdPerMxn } = useCurrency(),
    { lang } = useI18n()
  if (!config.loaded) return { loaded: false, result: null, error: null }
  try {
    return {
      loaded: true,
      result: resolveCartShipping({
        items: [item],
        ...config,
        destination: market.country || destination,
        locale: lang,
        charge: { currency: chargeCurrency, usdPerMxn },
      }),
      error: null,
    }
  } catch (error) {
    return { loaded: true, result: null, error: error.message }
  }
}
