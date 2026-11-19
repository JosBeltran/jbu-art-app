'use client'
import { Button } from '@carbon/react'
import { usePurchaseShipping } from './usePurchaseShipping'
import { shippingBenefitLabel } from '@/lib/purchaseBenefits'
import { shippingErrorText } from '@/lib/shippingCountries'
import { useI18n } from '@/components/I18nProvider'
import AskForPriceButton from '@/components/AskForPriceButton'
import styles from '@/components/purchase/PurchaseBenefits.module.css'
export default function ShippingBenefit({
  item,
  destination,
  artwork,
  settings,
}) {
  const { t, locale } = useI18n(),
    shipping = usePurchaseShipping(item, destination)
  if (!shipping.loaded)
    return <span>{t('Comprobando envío…', 'Checking shipping…')}</span>
  if (shipping.error)
    return (
      <div>
        <span>
          {shipping.error === 'shipping_destination_required'
            ? t('Envío según destino', 'Shipping based on destination')
            : shipping.error === 'shipping_quote_required'
              ? t('Envío por cotizar', 'Shipping quote required')
              : shippingErrorText(shipping.error, t)}
        </span>
        {shipping.error === 'shipping_unavailable' && <Button kind="ghost" size="sm"
          onClick={() => window.dispatchEvent(new Event('jbu:shipping-updated'))}>{t('Reintentar', 'Retry')}</Button>}
        {shipping.error === 'shipping_quote_required' && (
          <AskForPriceButton
            artwork={artwork}
            settings={settings}
            inquiryType="shipping"
            printVariantId={item.type === 'PRINT' ? item.id : null}
            kind="ghost"
            size="sm"
          />
        )}
      </div>
    )
  return (
    <div>
      {shipping.result.options.map((option, i) => (
        <div key={i} className={styles.shippingOption}>
          <span>{shippingBenefitLabel(option, t, locale)}</span>
          {option.minimumDays != null && (
            <span className={styles.supplement}>
              {t('Entrega estimada', 'Estimated delivery')}:{' '}
              {option.minimumDays}–{option.maximumDays}{' '}
              {t('días hábiles', 'business days')}
            </span>
          )}
          {option.method === 'BUYER_ARRANGED' && (
            <span className={styles.supplement}>
              {t(
                'El transporte corre por tu cuenta.',
                'Transportation is your responsibility.'
              )}
            </span>
          )}
          {option.groups
            .map((group) => group.policy)
            .map(
              (policy, index) =>
                policy[
                  `instructions_${locale.startsWith('en') ? 'en' : 'es'}`
                ] && (
                  <span key={index} className={styles.supplement}>
                    {
                      policy[
                        `instructions_${locale.startsWith('en') ? 'en' : 'es'}`
                      ]
                    }
                  </span>
                )
            )}
        </div>
      ))}
    </div>
  )
}
