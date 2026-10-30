'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'
import { CURRENCIES, CURRENCY_STORAGE_KEY, defaultCurrency, displayPrice } from '@/lib/currency'

const CurrencyContext = createContext({
  currency: 'MXN',
  setCurrency: (_next) => {},
  usdPerMxn: null,
  price: (amountMxn) => displayPrice(amountMxn, 'MXN', null, 'es-MX'),
})

/** Moneda de visualización; sigue al idioma solo mientras no haya elección manual. */
export function CurrencyProvider({ children }) {
  const { lang, locale } = useI18n()
  const [saved, setSaved] = useState(null)
  const [usdPerMxn, setRate] = useState(null)

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CURRENCY_STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura inicial de preferencia
      if (CURRENCIES.includes(v)) setSaved(v)
    } catch {
      // sin persistencia
    }
    let alive = true
    fetch('/api/exchange-rate')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const rate = Number(j?.usdPerMxn)
        if (alive && Number.isFinite(rate) && rate > 0) setRate(rate)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const currency = defaultCurrency(lang, saved)

  const setCurrency = useCallback((next) => {
    if (!CURRENCIES.includes(next)) return
    setSaved(next)
    try { window.localStorage.setItem(CURRENCY_STORAGE_KEY, next) } catch { /* sin persistencia */ }
  }, [])

  const price = useCallback((amountMxn) => displayPrice(amountMxn, currency, usdPerMxn, locale), [currency, usdPerMxn, locale])
  const value = useMemo(() => ({ currency, setCurrency, usdPerMxn, price }), [currency, setCurrency, usdPerMxn, price])
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  return useContext(CurrencyContext)
}

/** Aviso cuando se muestra USD aproximado pero Stripe cobra en MXN. */
export function ExchangeNote() {
  const { t } = useI18n()
  return (
    <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
      {t('El importe final puede variar ligeramente según el tipo de cambio aplicado al momento del pago.', 'Final amount may vary slightly depending on the exchange rate applied at checkout.')}
    </span>
  )
}
