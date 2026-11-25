'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  FilterableMultiSelect,
  InlineNotification,
  Select,
  SelectItem,
} from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { supabase } from '@/lib/supabaseClient'
import { useShipping } from '@/components/shipping/ShippingProvider'
import { itemPolicyIds } from '@/lib/shippingPolicies'
/** @param {{id:string,value?:string[]|null,onChange?:((ids:string[]|null)=>void)|null,productId?:string|null,kind?:string,item?:any,disabled?:boolean}} props */
export default function ShippingPolicyField({
  id,
  value = null,
  onChange = null,
  productId = null,
  kind = 'artwork',
  item = {},
  disabled = false,
}) {
  const { t } = useI18n(),
    config = useShipping(),
    [stored, setStored] = useState(null),
    [notice, setNotice] = useState('')
  useEffect(() => {
    if (!productId) return
    supabase
      .from(kind === 'print' ? 'artwork_prints' : 'artworks')
      .select('shipping_policy_ids')
      .eq('id', productId)
      .single()
      .then(({ data }) => setStored(data?.shipping_policy_ids || null))
  }, [productId, kind])
  const current = onChange ? value : stored,
    change = onChange || setStored
  const effective = itemPolicyIds(
    {
      ...item,
      type: kind === 'print' ? 'PRINT' : 'ORIGINAL',
      shipping_policy_ids: current,
    },
    config.defaults
  )
  const items = useMemo(()=>config.policies.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
  })),[config.policies])
  const selectedItems=useMemo(()=>items.filter(p=>current?.includes(p.id)),[items,current])
  return (
    <div>
      <h3>{t('Envíos y gestión logística', 'Shipping & Fulfillment')}</h3>
      <Select
        id={`${id}-mode`}
        labelText={t('Política de envío', 'Shipping policy')}
        value={current?.length ? 'custom' : 'default'}
        disabled={disabled}
        onChange={(e) =>
          change(
            e.target.value === 'default'
              ? null
              : config.policies
                  .filter((p) => p.active)
                  .slice(0, 1)
                  .map((p) => p.id)
          )
        }
      >
        <SelectItem
          value="default"
          text={t(
            'Utilizar política de envío predeterminada',
            'Use default shipping policy'
          )}
        />
        <SelectItem
          value="custom"
          text={t(
            'Utilizar política de envío personalizada',
            'Use custom shipping policy'
          )}
        />
      </Select>
      <FilterableMultiSelect
        id={id}
        titleText={t(
          'Políticas personalizadas (vacío: heredar)',
          'Custom policies (empty: inherit)'
        )}
        placeholder={t('Seleccionar políticas', 'Select policies')}
        items={items}
        itemToString={(p) => p?.name || ''}
        selectedItems={selectedItems}
        disabled={disabled}
        onChange={({ selectedItems }) => change(selectedItems.map((p) => p.id))}
      />
      <p>
        {t('Políticas efectivas', 'Effective policies')}:{' '}
        {config.policies
          .filter((p) => effective.includes(p.id))
          .map((p) => p.name)
          .join(', ') ||
          t(
            'Sin política configurada; compra bloqueada',
            'No policy configured; checkout blocked'
          )}
      </p>
      {!onChange && productId && (
        <Button
          kind="tertiary"
          disabled={disabled}
          onClick={async () => {
            try {
              const r = await fetch('/api/admin/shipping', {
                method: 'PUT',
                headers: {
                  ...(await authHeaders()),
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action: 'override',
                  kind,
                  id: productId,
                  policyIds: stored,
                }),
              })
              if (!r.ok) throw new Error('save_failed')
              setNotice(t('Política guardada.', 'Policy saved.'))
            } catch {
              setNotice(
                t('No se pudo guardar la política.', 'Could not save policy.')
              )
            }
          }}
        >
          {t('Guardar política de envío', 'Save shipping policy')}
        </Button>
      )}
      {notice && <InlineNotification kind="info" title={notice} />}
    </div>
  )
}

