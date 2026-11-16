'use client'
import {
  Certificate,
  Security,
  DeliveryTruck,
  Locked,
  Download,
  Edit,
  CheckmarkOutline,
  Image as ImageIcon,
} from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { productBenefits } from '@/lib/purchaseBenefits'
import ShippingBenefit from '@/components/shipping/ShippingBenefit'
import styles from './PurchaseBenefits.module.css'
export default function PurchaseBenefits({
  item,
  destination,
  artwork = item,
  settings = null,
}) {
  const { t } = useI18n()
  const labels = {
    certificate: t(
      'Certificado digital de autenticidad',
      'Digital Certificate of Authenticity'
    ),
    provenance: t(
      'Registro de propiedad y proveniencia',
      'Ownership and provenance record'
    ),
    secure: t('Compra segura con Stripe', 'Secure checkout with Stripe'),
    digital: t('Entrega digital', 'Digital delivery'),
    limited: t('Edición limitada', 'Limited edition'),
    embellished: t(
      'Intervenida a mano por el artista',
      'Hand-embellished by the artist'
    ),
    signed: t('Firmada y numerada', 'Signed and numbered'),
    specifications: item.paper_type,
  }
  const icons = {
    certificate: Certificate,
    provenance: Security,
    shipping: DeliveryTruck,
    secure: Locked,
    digital: Download,
    limited: CheckmarkOutline,
    embellished: Edit,
    signed: Edit,
    specifications: ImageIcon,
  }
  return (
    <ul
      className={styles.list}
      aria-label={t('Beneficios de compra', 'Purchase benefits')}
    >
      {productBenefits(item).map((benefit) => {
        const Icon = icons[benefit]
        return (
          <li key={benefit}>
            <Icon size={20} className={styles.icon} aria-hidden="true" />
            <div>
              {benefit === 'shipping' ? (
                <ShippingBenefit
                  item={item}
                  destination={destination}
                  artwork={artwork}
                  settings={settings}
                />
              ) : (
                labels[benefit]
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
