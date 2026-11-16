'use client'

import { useShipping } from '@/components/shipping/ShippingProvider'
import { InlineNotification } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { countryNames, resolveShippingCountries, shippingErrorText } from '@/lib/shippingCountries'

export default function CartShippingNotice({ items }) {
  const { t, locale } = useI18n()
  const { globalCountries } = useShipping()
  const shipping = resolveShippingCountries(items, globalCountries)
  if (!shipping.requiresShipping) return null
  const destinations = countryNames(shipping.countries, locale)
  return <InlineNotification kind={shipping.compatible ? 'info' : 'error'} lowContrast hideCloseButton
    title={shipping.compatible ? t(`Envío disponible a: ${destinations}.`, `Shipping available to: ${destinations}.`) :
      shippingErrorText('shipping_country_conflict', t)} />
}
