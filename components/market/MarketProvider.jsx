'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { selectedCountry } from '@/lib/countryAvailability'
import { useRouter, useSearchParams } from 'next/navigation'
import { useShipping } from '@/components/shipping/ShippingProvider'
import { supabase } from '@/lib/supabaseClient'
import { MARKET_COOKIE, marketFromCookies, marketCurrency } from '@/lib/market'
const Context = createContext({
  country: null,
  setCountry: (country) => {
    void country
  },
  ready: false,
})
export const useMarket = () => useContext(Context)
export default function MarketProvider({ children, initialCountry = null }) {
  const { globalCountries, loaded } = useShipping(),
    router = useRouter()
  const requestedCountry = selectedCountry(useSearchParams().get('country'))
  const [selected, setSelected] = useState(initialCountry)
  const country = !loaded
    ? selected
    : globalCountries.includes(selected)
      ? selected
      : null
  useEffect(() => {
    if (!loaded) return
    let active = true
    const restore = async () => {
      const local = marketFromCookies(document.cookie)
      if (requestedCountry && globalCountries.includes(requestedCountry)) {
        if (local !== requestedCountry) {
          document.cookie = `${MARKET_COOKIE}=${requestedCountry}; Path=/; Max-Age=31536000; SameSite=Lax`
          document.cookie =
            'jbu-currency-market=; Path=/; Max-Age=0; SameSite=Lax'
          router.refresh()
        }
        setSelected(requestedCountry)
        return
      }
      if (local && globalCountries.includes(local)) {
        setSelected(local)
        return
      }
      const { data } = await supabase.auth.getUser()
      const saved = data?.user?.user_metadata?.jbu_market
      if (active && globalCountries.includes(saved)) {
        document.cookie = `${MARKET_COOKIE}=${saved}; Path=/; Max-Age=31536000; SameSite=Lax`
        setSelected(saved)
        router.refresh()
      } else if (active && local) {
        document.cookie = `${MARKET_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
        setSelected(null)
        router.refresh()
      }
    }
    void restore()
    const sync = () => {
      const next = marketFromCookies(document.cookie)
      setSelected(globalCountries.includes(next) ? next : null)
      router.refresh()
    }
    window.addEventListener('jbu:market-changed', sync)
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') void restore()
    })
    return () => {
      active = false
      window.removeEventListener('jbu:market-changed', sync)
      listener.subscription.unsubscribe()
    }
  }, [loaded, globalCountries, router, requestedCountry])
  const setCountry = (next) => {
    if (next !== null && !globalCountries.includes(next)) return
    document.cookie = `${MARKET_COOKIE}=${next || ''}; Path=/; Max-Age=${next ? 31536000 : 0}; SameSite=Lax`
    // A market change resets the currency suggestion; an explicit currency
    // choice remains an independent preference within the current market.
    document.cookie = `jbu-currency-market=; Path=/; Max-Age=0; SameSite=Lax`
    if (next)
      document.cookie = `jbu-currency=${marketCurrency(next)}; Path=/; Max-Age=31536000; SameSite=Lax`
    setSelected(next)
    const location = new URL(window.location.href)
    if (location.searchParams.has('country')) {
      location.searchParams.set('country', next || 'ALL')
      router.replace(location.pathname + location.search + location.hash, {
        scroll: false,
      })
    }
    router.refresh()
    void supabase.auth.getUser().then(({ data }) => {
      if (data?.user)
        void supabase.auth.updateUser({ data: { jbu_market: next } })
    })
  }
  return (
    <Context.Provider value={{ country, setCountry, ready: loaded }}>
      {children}
    </Context.Provider>
  )
}
