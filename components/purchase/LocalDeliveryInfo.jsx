'use client'
import { useEffect, useState } from 'react'
import { Accordion, AccordionItem } from '@carbon/react'
import { Location } from '@carbon/icons-react'
import { useMarket } from '@/components/market/MarketProvider'
import { useI18n } from '@/components/I18nProvider'
import { usePurchaseShipping } from '@/components/shipping/usePurchaseShipping'
import { localPurchaseCapabilities } from '@/lib/localDelivery'
import AskForPriceButton from '@/components/AskForPriceButton'
import PaymentDelivery from '@/components/delivery/PaymentDelivery'
import styles from './LocalDeliveryInfo.module.css'
export default function LocalDeliveryInfo({ artwork, user, settings }) {
  const market = useMarket(),
    { t } = useI18n(),
    item = { ...artwork, type: 'ORIGINAL' },
    shipping = usePurchaseShipping(item, market.country)
  const [config, setConfig] = useState(null)
  useEffect(() => {
    let active = true
    fetch('/api/local-delivery', { cache: 'no-store' })
      .then((r) => r.json())
      .then((result) => {
        if (active) setConfig(result.config)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const capabilities = localPurchaseCapabilities({
    item,
    market: market.country,
    shipping: shipping.result,
    config,
  })
  if (!capabilities.localDelivery) return null
  return (
    <div className={styles.section}>
      <Accordion size="sm">
        <AccordionItem
          title={
            <span className={styles.title}>
              <Location size={20} aria-hidden="true" />
              {t('¿Estás en Monterrey?', 'Are you in Monterrey?')}
            </span>
          }
        >
          <p>
            {t('Entrega local en Monterrey', 'Local delivery in Monterrey')}
          </p>
          <p className={styles.description}>
            {t(
              'Si tu dirección en Monterrey o su zona metropolitana es elegible, puedes coordinar la entrega directamente con el artista. La dirección y el horario deben confirmarse.',
              'If your address in Monterrey or its metropolitan area is eligible, you can arrange delivery directly with the artist. Address and appointment eligibility must be confirmed.'
            )}
          </p>
          {capabilities.paymentOnDelivery ? (
            <>
              <p className={styles.description}>
                {t(
                  'Para esta obra puedes consultar el pago al recibir. Se requiere una cuenta gratuita y confirmar la disponibilidad.',
                  'For this artwork you can explore payment on delivery. A free account and availability confirmation are required.'
                )}
              </p>
              <PaymentDelivery
                items={[item]}
                localOnly
                eligibility={capabilities}
                onlineLabel={t(
                  'Consultar entrega local',
                  'Explore local delivery'
                )}
                disabled={false}
              />
            </>
          ) : (
            <>
              <p className={styles.description}>
                {t(
                  'Esta opción requiere pago anticipado. El pago al recibir no está disponible para esta obra.',
                  'This option requires advance payment. Payment on delivery is not available for this artwork.'
                )}
              </p>
              <AskForPriceButton
                artwork={artwork}
                settings={settings}
                inquiryType="local_delivery"
                kind="ghost"
                size="sm"
              />
            </>
          )}
          {!user && capabilities.paymentOnDelivery && (
            <a
              className={styles.register}
              href={
                '/signup?redirect=' +
                encodeURIComponent('/artwork/' + artwork.sku)
              }
            >
              {t('Registrarme gratis', 'Create a free account')}
            </a>
          )}
        </AccordionItem>
      </Accordion>
    </div>
  )
}
