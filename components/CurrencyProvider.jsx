'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useI18n, currencyFromLocales } from '@/components/I18nProvider'
import { useMarket } from '@/components/market/MarketProvider'
import { marketCurrency, cookieValue } from '@/lib/market'
import {
  CURRENCIES,
  CURRENCY_STORAGE_KEY,
  displayPrice,
  displayTotal,
} from '@/lib/currency'

const CurrencyContext = createContext({
  currency: 'MXN',
  setCurrency: (_next) => {},
  usdPerMxn: null,
  price: (amountMxn) => displayPrice(amountMxn, 'MXN', null, 'es-MX'),
  total: (items) => displayTotal(items, 'MXN', null, 'es-MX'),
})

/** Moneda de visualización; sigue al idioma solo mientras no haya elección manual. */
export function CurrencyProvider({ children, initialCurrency = null }) {
  const {
    locale,
    browserRegions,
    userPreferences,
    savePreference,
    authUserId,
    preferencesReady,
  } = useI18n()
  const { country, ready: marketReady } = useMarket()
  const [saved, setSaved] = useState(null)
  const [usdPerMxn, setRate] = useState(null)

  useEffect(() => {
    let alive = true
    fetch('/api/exchange-rate')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const rate = Number(j?.usdPerMxn)
        if (alive && Number.isFinite(rate) && rate > 0) setRate(rate)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // A manual selection only applies to the current identity, never a different account.
  const currency =
    (saved?.userId === authUserId && saved?.market === country
      ? saved.currency
      : null) ||
    (country
      ? marketCurrency(country)
      : userPreferences.currency ||
        (!preferencesReady && CURRENCIES.includes(initialCurrency)
          ? initialCurrency
          : currencyFromLocales(browserRegions)))

  const chargeCurrency =
    currency === 'USD' && Number.isFinite(usdPerMxn) && usdPerMxn > 0
      ? 'USD'
      : 'MXN'

  useEffect(() => {
    if (!marketReady) return
    const value=cookieValue(document.cookie,CURRENCY_STORAGE_KEY)
    const matches=cookieValue(document.cookie,'jbu-currency-market')===country
    let active=true
    if(matches&&CURRENCIES.includes(value))queueMicrotask(()=>{if(active)setSaved({currency:value,userId:authUserId,market:country})})
    return()=>{active=false}
  }, [country, authUserId, marketReady])

  // Cookie para el checkout: refleja la moneda que realmente se muestra/cobra.
  useEffect(() => {
    if (!marketReady) return
    try {
      document.cookie = `${CURRENCY_STORAGE_KEY}=${chargeCurrency}; Path=/; Max-Age=31536000; SameSite=Lax`
    } catch {
      /* sin cookie */
    }
  }, [chargeCurrency, marketReady])

  const setCurrency = useCallback(
    (next) => {
      if (!CURRENCIES.includes(next)) return
      setSaved({ currency: next, userId: authUserId, market: country })
      document.cookie = `jbu-currency-market=${country || ''}; Path=/; Max-Age=31536000; SameSite=Lax`
      void savePreference('currency', next)
    },
    [savePreference, authUserId, country]
  )

  const price = useCallback(
    (amountMxn) => displayPrice(amountMxn, currency, usdPerMxn, locale),
    [currency, usdPerMxn, locale]
  )
  const total = useCallback(
    (items) => displayTotal(items, currency, usdPerMxn, locale),
    [currency, usdPerMxn, locale]
  )
  const value = useMemo(
    () => ({ currency, chargeCurrency, setCurrency, usdPerMxn, price, total }),
    [currency, chargeCurrency, setCurrency, usdPerMxn, price, total]
  )
  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}

/** Aviso cuando se muestra y cobra USD convertido desde el precio en MXN. */
export function ExchangeNote() {
  const { t } = useI18n()
  return (
    <span
      style={{
        display: 'block',
        fontSize: '0.75rem',
        fontWeight: 400,
        color: 'var(--cds-text-secondary)',
        marginTop: '0.25rem',
      }}
    >
      {t(
        'Se cobrará en USD, convertido desde el precio en MXN con el tipo de cambio del día. Tu banco podría aplicar comisiones propias.',
        'You will be charged in USD, converted from the MXN price at today’s exchange rate. Your bank may apply its own fees.'
      )}
    </span>
  )
}
