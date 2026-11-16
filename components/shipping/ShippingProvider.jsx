'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Modal, Select, SelectItem } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { countryNames } from '@/lib/shippingCountries'
const Context = createContext({
  globalCountries: [],
  policies: [],
  defaults: {},
  loaded: false,
})
export const useShipping = () => useContext(Context)

/** Retry the original authoritative endpoint after a lightweight destination choice. */
export async function shippingCheckoutFetch(url, options) {
  const response = await fetch(url, options)
  if (response.status !== 409) return response
  const body = await response
    .clone()
    .json()
    .catch(() => ({}))
  if (body.error !== 'shipping_destination_required' || !body.countries?.length)
    return response
  const destination = await new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent('jbu:shipping-destination', {
        detail: { countries: body.countries, resolve },
      })
    )
  )
  if (!destination) return response
  return fetch(url, {
    ...options,
    body: JSON.stringify({ ...JSON.parse(options.body), destination }),
  })
}
export default function ShippingProvider({ children }) {
  const { t, locale } = useI18n()
  const [config, setConfig] = useState({
    globalCountries: [],
    policies: [],
    defaults: {},
    loaded: false,
  })
  const [choice, setChoice] = useState(null),
    [destination, setDestination] = useState('')
  const pending = useRef(null)
  useEffect(() => {
    let active = true
    const refresh = () =>
      fetch('/api/shipping', { cache: 'no-store' })
        .then(async (r) => {
          if (!r.ok) throw new Error('shipping_unavailable')
          const value = await r.json()
          if (active) setConfig({ ...value, loaded: true })
        })
        .catch(() => {
          if (active)
            setConfig({
              globalCountries: [],
              policies: [],
              defaults: {},
              loaded: true,
            })
        })
    void refresh()
    const choose = (event) => {
      pending.current?.(null)
      pending.current = event.detail.resolve
      setChoice(event.detail.countries)
      const preferred = new URLSearchParams(window.location.search).get(
        'country'
      )
      setDestination(
        event.detail.countries.includes(preferred)
          ? preferred
          : event.detail.countries[0]
      )
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('jbu:shipping-updated', refresh)
    window.addEventListener('jbu:shipping-destination', choose)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('jbu:shipping-updated', refresh)
      window.removeEventListener('jbu:shipping-destination', choose)
      pending.current?.(null)
    }
  }, [])
  const finish = (value) => {
    pending.current?.(value)
    pending.current = null
    setChoice(null)
  }
  return (
    <Context.Provider value={config}>
      {children}
      <Modal
        open={Boolean(choice)}
        modalHeading={t('Destino de envío', 'Shipping destination')}
        primaryButtonText={t('Continuar al pago', 'Continue to checkout')}
        secondaryButtonText={t('Cancelar', 'Cancel')}
        onRequestClose={() => finish(null)}
        onRequestSubmit={() => finish(destination)}
      >
        <p>
          {t(
            'El método y el importe de envío dependen del destino.',
            'Shipping method and amount depend on the destination.'
          )}
        </p>
        <Select
          id="checkout-destination"
          labelText={t('País', 'Country')}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
        >
          {(choice || []).map((code) => (
            <SelectItem
              key={code}
              value={code}
              text={countryNames([code], locale)}
            />
          ))}
        </Select>
      </Modal>
    </Context.Provider>
  )
}
