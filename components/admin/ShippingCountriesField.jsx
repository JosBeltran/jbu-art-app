'use client'
import { useMemo } from 'react'
import { FilterableMultiSelect, Select, SelectItem } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { useShipping } from '@/components/shipping/ShippingProvider'
import {
  countryNames,
  resolveEffectiveCountries,
} from '@/lib/shippingCountries'
export default function ShippingCountriesField({
  id,
  value,
  onChange,
  disabled = false,
  parentCountries = null,
}) {
  const { t, locale } = useI18n(),
    { globalCountries } = useShipping()
  // Disabled markets in an explicit restriction remain selected and persisted.
  const items = useMemo(
    () =>
      [...new Set([...globalCountries, ...(value || [])])]
        .map((code) => ({
          code,
          name: `${countryNames([code], locale)} (${code})${globalCountries.includes(code) ? '' : t(' · deshabilitado globalmente', ' · globally disabled')}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [globalCountries, value, locale, t]
  )
  const selectedItems=useMemo(()=>items.filter(item=>value?.includes(item.code)),[items,value])
  const restricted = Boolean(value?.length)
  const effective = resolveEffectiveCountries({
    globalCountries,
    artworkCountries: parentCountries,
    variantCountries: value,
  })
  return (
    <div>
      <Select
        id={`${id}-mode`}
        labelText={t('Disponibilidad por país', 'Country availability')}
        value={restricted ? 'restricted' : 'global'}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            e.target.value === 'global'
              ? null
              : [...(globalCountries.length ? globalCountries : [])]
          )
        }
      >
        <SelectItem
          value="global"
          text={t(
            'Utilizar destinos globales de envío',
            'Use global shipping destinations'
          )}
        />
        <SelectItem
          value="restricted"
          text={t(
            'Restringir a países específicos',
            'Restrict to selected countries'
          )}
        />
      </Select>
      {restricted && (
        <FilterableMultiSelect
          id={id}
          titleText={t(
            'Países permitidos para envío',
            'Allowed shipping countries'
          )}
          placeholder={t(
            'Buscar por nombre o código',
            'Search by name or code'
          )}
          items={items}
          itemToString={(item) => item?.name || ''}
          disabled={disabled}
          selectedItems={selectedItems}
          onChange={({ selectedItems }) =>
            onChange(selectedItems.map((item) => item.code))
          }
        />
      )}
      <p>
        {t('Destinos efectivos', 'Effective destinations')}:{' '}
        {effective.length
          ? countryNames(effective, locale)
          : t('Ninguno', 'None')}
      </p>
    </div>
  )
}

