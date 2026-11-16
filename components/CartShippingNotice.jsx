'use client'

import { useMarket } from '@/components/market/MarketProvider'
import { useShipping } from '@/components/shipping/ShippingProvider'
import { InlineNotification } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { countryNames, resolveShippingCountries, shippingErrorText } from '@/lib/shippingCountries'

export default function CartShippingNotice({ items }) {
  const { t, locale } = useI18n()
  const { globalCountries } = useShipping()
  const shipping = resolveShippingCountries(items, globalCountries)
  const {country}=useMarket()
  if(country&&shipping.requiresShipping&&!shipping.countries.includes(country))return <InlineNotification kind="error" lowContrast hideCloseButton title={t('Tu carrito no está disponible para el país seleccionado. Cambia el destino o revisa los productos.','Your cart is unavailable in the selected country. Change destination or review the products.')}/>
  if (!shipping.requiresShipping) return null
  const destinations = countryNames(shipping.countries, locale)
  return <InlineNotification kind={shipping.compatible ? 'info' : 'error'} lowContrast hideCloseButton
    title={shipping.compatible ? t(`Envío disponible a: ${destinations}.`, `Shipping available to: ${destinations}.`) :
      shippingErrorText('shipping_country_conflict', t)} />
}
