'use client'
import { useShipping } from './ShippingProvider'
import { useI18n } from '@/components/I18nProvider'
import { resolveCartShipping } from '@/lib/shippingPolicies'
import { shippingErrorText } from '@/lib/shippingCountries'
import AskForPriceButton from '@/components/AskForPriceButton'
export default function ShippingSummary({
  item,
  destination,
  artwork,
  settings,
}) {
  const config = useShipping(),
    { t, locale } = useI18n()
  if (!config.loaded) return null
  let result, error
  try {
    result = resolveCartShipping({
      items: [item],
      ...config,
      destination,
      locale,
    })
  } catch (e) {
    error = e.message
  }
  if (error)
    return (
      <div>
        <p>
          {error === 'shipping_destination_required'
            ? t(
                'El envío depende del destino.',
                'Shipping depends on the destination.'
              )
            : shippingErrorText(error, t)}
        </p>
        {error === 'shipping_quote_required' && (
          <AskForPriceButton
            artwork={artwork}
            settings={settings}
            inquiryType="shipping"
            printVariantId={item.type === 'PRINT' ? item.id : null}
            kind="tertiary"
          />
        )}
      </div>
    )
  return (
    <div>
      {result.options.map((option, index) => (
        <p key={index}>
          {option.displayName} ·{' '}
          {new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: option.currency,
          }).format(option.amount / 100)}
          {option.minimumDays != null
            ? ` · ${t('Entrega estimada:', 'Estimated delivery:')} ${option.minimumDays}–${option.maximumDays} ${t('días hábiles', 'business days')}`
            : ''}
          {option.method === 'BUYER_ARRANGED'
            ? t(
                ' · Transporte a cargo del comprador; no incluido.',
                ' · Transportation arranged by the buyer; not included.'
              )
            : ''}
          {option.groups
            .map((g) =>
              locale === 'en'
                ? g.policy.instructions_en
                : g.policy.instructions_es
            )
            .filter(Boolean)
            .map((text, i) => (
              <span key={i}> · {text}</span>
            ))}
        </p>
      ))}
    </div>
  )
}
