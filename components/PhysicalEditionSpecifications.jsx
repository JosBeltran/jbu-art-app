'use client'

import { Certificate, DeliveryTruck, Edit, Image, Information, Ruler, Security } from '@carbon/icons-react'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { countryNames } from '@/lib/shippingCountries'
import ShippingBenefit from '@/components/shipping/ShippingBenefit'
import styles from '@/components/purchase/PurchaseBenefits.module.css'

export default function PhysicalEditionSpecifications({ artwork, destination, siteSettings }) {
  const { t, lang, locale } = useI18n()
  const localized = useLocalized()
  const description = lang === 'en'
    ? artwork.physical_edition_description_en || artwork.physical_edition_description_es
    : artwork.physical_edition_description_es || artwork.physical_edition_description_en
  const rows = [
    [Ruler, artwork.dimensions],
    [Image, [localized(artwork, 'medium'), localized(artwork, 'technique')].filter(Boolean).join(' · ')],
    [Image, lang === 'en' ? artwork.physical_edition_frame_en || artwork.physical_edition_frame_es : artwork.physical_edition_frame_es || artwork.physical_edition_frame_en],
    [Information, artwork.physical_edition_made_to_order && t('Producida bajo pedido', 'Made to order')],
    [Edit, artwork.physical_edition_signed && artwork.physical_edition_signature_confirmed && t('Firma individual del artista', 'Individually signed by the artist')],
    [Security, t('Registro individual de la edición', 'Individual edition registration')],
    [Certificate, t('Certificado digital de autenticidad con verificación por QR', 'Digital Certificate of Authenticity with QR verification')],
  ]
  return (
    <>
      {description && <p>{description}</p>}
      <ul className={styles.list} aria-label={t('Especificaciones de la edición', 'Edition specifications')}>
        {rows.map(([Icon, label], i) => label && <li key={i}><Icon size={20} className={styles.icon} aria-hidden="true" /><div>{label}</div></li>)}
        <li><DeliveryTruck size={20} className={styles.icon} aria-hidden="true" /><div>{destination && <span>{countryNames([destination], locale)}</span>}<ShippingBenefit item={{ ...artwork, type: 'ORIGINAL' }} destination={destination} artwork={artwork} settings={siteSettings} /></div></li>
      </ul>
      <p>{t(
        'Cada pieza de colección pertenece a un tiraje estrictamente limitado. Cada ejemplar adquirido tiene una identidad propia y un certificado digital de autenticidad registrado en JBU.',
        'Each collectible belongs to a strictly limited edition. Every purchased unit has its own individual identity and digital Certificate of Authenticity registered within JBU.'
      )}</p>
    </>
  )
}
