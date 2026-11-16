'use client'
import { useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  FilterableMultiSelect,
  InlineLoading,
  InlineNotification,
  NumberInput,
  Select,
  SelectItem,
  TextArea,
  TextInput,
  Tile,
} from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { SHIPPING_COUNTRY_CODES, countryNames } from '@/lib/shippingCountries'
import {
  SHIPPING_METHODS,
  SHIPPING_PROVIDERS,
  SHIPPING_STRATEGIES,
  SHIPPING_CATEGORIES,
} from '@/lib/shippingPolicies'
const newPolicy = () => ({
  id: crypto.randomUUID(),
  name: '',
  name_en: '',
  name_es: '',
  method: 'INCLUDED',
  countries: [],
  amount_minor: 0,
  currency: 'MXN',
  minimum_days: null,
  maximum_days: null,
  delivery_unit: 'business_day',
  fulfillment_provider: 'ARTIST',
  strategy: 'PER_ITEM',
  insurance_required: false,
  active: true,
  postal_codes: [],
  instructions_en: '',
  instructions_es: '',
  notes: '',
})
async function api(options = {}) {
  const r = await fetch('/api/admin/shipping', {
    ...options,
    cache: 'no-store',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error)
  return data
}
export default function ShippingSettings() {
  const { t, locale } = useI18n(),
    [config, setConfig] = useState(null),
    [policy, setPolicy] = useState(null),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState({
      kind: 'print',
      id: '',
      destination: '',
    }),
    [result, setResult] = useState(null)
  const countries = SHIPPING_COUNTRY_CODES.map((code) => ({
    code,
    name: `${countryNames([code], locale)} (${code})`,
  })).sort((a, b) => a.name.localeCompare(b.name, locale))
  const categories = {
    original: t('Obras originales', 'Original artworks'),
    open_print: t('Reproducciones abiertas', 'Open Edition prints'),
    limited_print: t('Reproducciones limitadas', 'Limited Edition prints'),
    physical: t('Otros productos físicos', 'Other physical products'),
    supplier: t('Productos de proveedor', 'Supplier products'),
  }
  const methods = {
    INCLUDED: t('Envío incluido', 'Shipping included'),
    FIXED_RATE: t('Tarifa fija', 'Fixed rate'),
    LOCAL_DELIVERY: t('Entrega local', 'Local delivery'),
    LOCAL_PICKUP: t('Recogida local', 'Local pickup'),
    BUYER_ARRANGED: t('Organiza tu propio envío', 'Arrange your own shipping'),
    QUOTE_REQUIRED: t('Envío por cotizar', 'Shipping quote required'),
  }
  useEffect(() => {
    api()
      .then(setConfig)
      .catch((error) => setNotice(error.message))
  }, [])
  const perform = async (body) => {
    setBusy(true)
    setNotice('')
    try {
      setConfig(await api({ method: 'PUT', body: JSON.stringify(body) }))
      window.dispatchEvent(new Event('jbu:shipping-updated'))
      setNotice(t('Configuración guardada.', 'Settings saved.'))
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy(false)
    }
  }
  const set = (key, value) => setPolicy((p) => ({ ...p, [key]: value }))
  const multi = (id, label, value, onChange, items = countries) => (
    <FilterableMultiSelect
      id={id}
      titleText={label}
      placeholder={t('Buscar por nombre o código', 'Search by name or code')}
      items={items}
      itemToString={(item) => item?.name || ''}
      selectedItems={items.filter((item) => value?.includes(item.code))}
      onChange={({ selectedItems }) =>
        onChange(selectedItems.map((item) => item.code))
      }
    />
  )
  return (
    <div
      style={{
        maxWidth: 1000,
        margin: '0 auto',
        padding: '2rem',
        display: 'grid',
        gap: '2rem',
      }}
    >
      <h1>{t('Envíos y gestión logística', 'Shipping & Fulfillment')}</h1>
      {notice && (
        <InlineNotification
          kind="info"
          title={t('Configuración de envío', 'Shipping settings')}
          subtitle={notice}
          onCloseButtonClick={() => setNotice('')}
        />
      )}
      {!config ? (
        <InlineLoading
          description={t('Cargando configuración…', 'Loading settings…')}
        />
      ) : (
        <>
          <Tile>
            <h2>{t('Destinos globales', 'Global Destinations')}</h2>
            {multi(
              'global-destinations',
              t('Países habilitados', 'Enabled countries'),
              config.globalCountries,
              (value) => setConfig({ ...config, globalCountries: value })
            )}
            <p>
              {config.globalCountries.length}{' '}
              {t('destinos habilitados', 'enabled destinations')}
            </p>
            <Button
              kind="ghost"
              onClick={() =>
                setConfig({
                  ...config,
                  globalCountries: [...SHIPPING_COUNTRY_CODES],
                })
              }
            >
              {t('Seleccionar todos', 'Select all')}
            </Button>
            <Button
              kind="ghost"
              onClick={() => setConfig({ ...config, globalCountries: [] })}
            >
              {t('Limpiar', 'Clear')}
            </Button>
          </Tile>
          <Tile>
            <h2>
              {t(
                'Políticas predeterminadas por producto',
                'Default Product Policies'
              )}
            </h2>
            {SHIPPING_CATEGORIES.map((category) =>
              multi(
                `default-${category}`,
                categories[category],
                config.defaults[category] || [],
                (ids) =>
                  setConfig({
                    ...config,
                    defaults: { ...config.defaults, [category]: ids },
                  }),
                config.policies
                  .filter((p) => p.active)
                  .map((p) => ({ code: p.id, name: p.name }))
              )
            )}
            <Button
              disabled={busy}
              onClick={() =>
                perform({
                  action: 'settings',
                  globalCountries: config.globalCountries,
                  defaults: config.defaults,
                })
              }
            >
              {t(
                'Guardar destinos y políticas predeterminadas',
                'Save destinations and defaults'
              )}
            </Button>
          </Tile>
          <Tile>
            <h2>{t('Políticas de envío', 'Shipping Policies')}</h2>
            <Select
              id="policy-editor"
              labelText={t('Editar política', 'Edit policy')}
              value={policy?.id || ''}
              onChange={(e) =>
                setPolicy(
                  config.policies.find((p) => p.id === e.target.value) || null
                )
              }
            >
              <SelectItem
                value=""
                text={t('Selecciona una política', 'Choose a policy')}
              />
              {config.policies.map((p) => (
                <SelectItem
                  key={p.id}
                  value={p.id}
                  text={`${p.name}${p.active ? '' : t(' (inactiva)', ' (inactive)')}`}
                />
              ))}
            </Select>
            <Button kind="tertiary" onClick={() => setPolicy(newPolicy())}>
              {t('Nueva política', 'New policy')}
            </Button>
            {policy && (
              <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                {['name', 'name_en', 'name_es'].map((key, index) => (
                  <TextInput
                    key={key}
                    id={`policy-${key}`}
                    labelText={
                      [
                        t('Nombre interno', 'Internal name'),
                        'Name (English)',
                        'Nombre (Español)',
                      ][index]
                    }
                    value={policy[key]}
                    maxLength={100}
                    onChange={(e) => set(key, e.target.value)}
                  />
                ))}
                <Select
                  id="policy-method"
                  labelText={t('Método', 'Method')}
                  value={policy.method}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      method: e.target.value,
                      ...(e.target.value === 'INCLUDED'
                        ? { amount_minor: 0 }
                        : {}),
                    })
                  }
                >
                  {SHIPPING_METHODS.map((m) => (
                    <SelectItem key={m} value={m} text={methods[m]} />
                  ))}
                </Select>
                {multi(
                  'policy-countries',
                  t(
                    'Destinos (vacío: todos los destinos globales)',
                    'Destinations (empty: all global destinations)'
                  ),
                  policy.countries,
                  (value) => set('countries', value)
                )}
                <NumberInput
                  id="policy-amount"
                  label={t(
                    'Importe MXN (centavos; 35000 = $350.00)',
                    'MXN amount (minor units; 35000 = $350.00)'
                  )}
                  min={0}
                  max={99999999}
                  value={policy.amount_minor}
                  disabled={policy.method === 'INCLUDED'}
                  onChange={(_, data) =>
                    set('amount_minor', Number(data.value))
                  }
                />
                <Select
                  id="policy-strategy"
                  labelText={t('Cálculo de tarifa', 'Rate calculation')}
                  value={policy.strategy}
                  onChange={(e) => set('strategy', e.target.value)}
                >
                  {SHIPPING_STRATEGIES.map((s, i) => (
                    <SelectItem
                      key={s}
                      value={s}
                      text={
                        [
                          t('Por artículo / cantidad', 'Per item / quantity'),
                          t(
                            'Una vez por pedido y política',
                            'Once per order and policy'
                          ),
                          t(
                            'Por proveedor y política',
                            'Per provider and policy'
                          ),
                        ][i]
                      }
                    />
                  ))}
                </Select>
                <Select
                  id="policy-provider"
                  labelText={t(
                    'Responsable de logística',
                    'Fulfillment provider'
                  )}
                  value={policy.fulfillment_provider}
                  onChange={(e) => set('fulfillment_provider', e.target.value)}
                >
                  {SHIPPING_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p} text={p} />
                  ))}
                </Select>
                <p>
                  {t(
                    'Estimación opcional en días hábiles. Completa ambos límites o deja ambos vacíos.',
                    'Optional estimate in business days. Supply both limits or leave both blank.'
                  )}
                </p>
                {['minimum_days', 'maximum_days'].map((key, i) => (
                  <TextInput
                    key={key}
                    id={`policy-${key}`}
                    type="number"
                    min="1"
                    max="365"
                    labelText={
                      i
                        ? t('Máximo de días hábiles', 'Maximum business days')
                        : t('Mínimo de días hábiles', 'Minimum business days')
                    }
                    value={policy[key] ?? ''}
                    onChange={(e) =>
                      set(
                        key,
                        e.target.value === '' ? null : Number(e.target.value)
                      )
                    }
                  />
                ))}
                <TextInput
                  id="policy-postal"
                  labelText={t(
                    'Códigos postales para entrega local (separados por coma)',
                    'Local delivery postal codes (comma separated)'
                  )}
                  helperText={t(
                    'Las políticas con restricción postal requieren revisión antes de abrir Checkout.',
                    'Postal-restricted policies require review before opening Checkout.'
                  )}
                  value={policy.postal_codes.join(',')}
                  onChange={(e) =>
                    set(
                      'postal_codes',
                      e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean)
                    )
                  }
                />
                {['instructions_en', 'instructions_es', 'notes'].map(
                  (key, i) => (
                    <TextArea
                      key={key}
                      id={`policy-${key}`}
                      labelText={
                        [
                          'Delivery instructions (English)',
                          'Instrucciones de entrega (Español)',
                          t('Notas administrativas', 'Administrative notes'),
                        ][i]
                      }
                      value={policy[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  )
                )}
                <Checkbox
                  id="policy-insurance"
                  labelText={t('Seguro requerido', 'Insurance required')}
                  checked={policy.insurance_required}
                  onChange={(_, data) =>
                    set('insurance_required', data.checked)
                  }
                />
                <Checkbox
                  id="policy-active"
                  labelText={t('Activa', 'Active')}
                  checked={policy.active}
                  onChange={(_, data) => set('active', data.checked)}
                />
                <Button
                  disabled={busy}
                  onClick={() => perform({ action: 'policy', policy })}
                >
                  {t('Guardar política', 'Save policy')}
                </Button>
              </div>
            )}
          </Tile>
          <Tile>
            <h2>{t('Vista previa de envío', 'Shipping Preview')}</h2>
            <Select
              id="preview-kind"
              labelText={t('Tipo de producto', 'Product type')}
              value={preview.kind}
              onChange={(e) => setPreview({ ...preview, kind: e.target.value })}
            >
              <SelectItem value="print" text="Fine Art Print" />
              <SelectItem
                value="artwork"
                text={t('Obra original', 'Original artwork')}
              />
            </Select>
            <TextInput
              id="preview-id"
              labelText={t(
                'ID del producto o variante',
                'Product or variant ID'
              )}
              value={preview.id}
              onChange={(e) => setPreview({ ...preview, id: e.target.value })}
            />
            <Select
              id="preview-country"
              labelText={t('Destino', 'Destination')}
              value={preview.destination}
              onChange={(e) =>
                setPreview({ ...preview, destination: e.target.value })
              }
            >
              <SelectItem
                value=""
                text={t(
                  'Todos los destinos compatibles',
                  'All compatible destinations'
                )}
              />
              {config.globalCountries.map((c) => (
                <SelectItem
                  key={c}
                  value={c}
                  text={countryNames([c], locale)}
                />
              ))}
            </Select>
            <Button
              kind="tertiary"
              disabled={busy}
              onClick={async () => {
                try {
                  setResult(
                    await api({
                      method: 'POST',
                      body: JSON.stringify({
                        ...preview,
                        locale,
                        destination: preview.destination || null,
                      }),
                    })
                  )
                  setNotice('')
                } catch (error) {
                  setResult(null)
                  setNotice(error.message)
                }
              }}
            >
              {t('Vista previa', 'Preview')}
            </Button>
            {result && (
              <div>
                <p>{countryNames(result.countries, locale)}</p>
                {result.options.map((option, i) => (
                  <p key={i}>
                    {option.displayName} ·{' '}
                    {new Intl.NumberFormat(locale, {
                      style: 'currency',
                      currency: option.currency,
                    }).format(option.amount / 100)}
                    {option.minimumDays != null
                      ? ` · ${option.minimumDays}–${option.maximumDays} ${t('días hábiles', 'business days')}`
                      : ''}{' '}
                    ·{' '}
                    {option.groups
                      .map((g) => g.policy.fulfillment_provider)
                      .join(', ')}
                  </p>
                ))}
              </div>
            )}
          </Tile>
          <a href="/admin/orders">
            {t('Órdenes y gestión logística', 'Orders and Fulfillment')}
          </a>
        </>
      )}
    </div>
  )
}
