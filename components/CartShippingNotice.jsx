'use client'

import { InlineNotification } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { countryNames, resolveShippingCountries, shippingErrorText } from '@/lib/shippingCountries'

export default function CartShippingNotice({ items }) {
  const { t, locale } = useI18n()
  const shipping = resolveShippingCountries(items)
  if (!shipping.restricted) return null
  const destinations = countryNames(shipping.countries, locale)
  return <InlineNotification kind={shipping.compatible ? 'info' : 'error'} lowContrast hideCloseButton
    title={shipping.compatible ? t(`Envío disponible a: ${destinations}.`, `Shipping available to: ${destinations}.`) :
      shippingErrorText('shipping_country_conflict', t)} />
}
