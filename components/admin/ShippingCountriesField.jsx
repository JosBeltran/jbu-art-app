'use client'

import { useMemo } from 'react'
import { FilterableMultiSelect } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { SHIPPING_COUNTRY_CODES, countryNames } from '@/lib/shippingCountries'

export default function ShippingCountriesField({ id, value, onChange, disabled = false }) {
  const { t, locale } = useI18n()
  const items = useMemo(() => SHIPPING_COUNTRY_CODES.map(code => ({ code, name: countryNames([code], locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale)), [locale])
  const selectedItems = useMemo(() => items.filter(item => value?.includes(item.code)), [items, value])
  return <FilterableMultiSelect id={id} titleText={t('Países permitidos para envío', 'Allowed Shipping Countries')}
    placeholder={t('Buscar países', 'Search countries')}
    helperText={t('Opcional. Vacío permite los destinos del pedido. La cobertura de envío se configura por separado.', 'Optional. Leave empty to use the order destinations. Shipping coverage is configured separately.')}
    items={items} itemToString={item => item?.name || ''} disabled={disabled}
    selectedItems={selectedItems}
    onChange={({ selectedItems }) => onChange(selectedItems.map(item => item.code))} />
}
