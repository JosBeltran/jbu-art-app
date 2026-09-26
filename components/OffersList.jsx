'use client'

import Link from 'next/link'
import { Tag, Button } from '@carbon/react'
import { Email } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import { useI18n } from '@/components/I18nProvider'
import styles from './OffersList.module.css'

const STATUS = {
  PENDING: { type: 'purple', es: 'Pendiente', en: 'Pending' },
  ACCEPTED: { type: 'green', es: 'Aceptada', en: 'Accepted' },
  REJECTED: { type: 'red', es: 'Rechazada', en: 'Declined' }
}

/**
 * @param {{ offers: any[], admin?: boolean, onStatusChange?: (id: string, status: string) => void, updatingId?: string | null }} props
 */
export default function OffersList({ offers, admin = false, onStatusChange = undefined, updatingId = null }) {
  const { t, locale } = useI18n()
  const money = (v) => `$${Number(v || 0).toLocaleString(locale)} MXN`

  return (
    <ul className={styles.list}>
      {offers.map((offer) => {
        const art = offer.artworks || {}
        const list = art.base_price_mxn || art.calculated_price_mxn
        const s = STATUS[offer.status] || STATUS.PENDING
        return (
          <li key={offer.id} className={styles.item}>
            <Link href={art.sku ? `/artwork/${art.sku}` : '#'} className={styles.thumb}>
              <ArtworkImage title={art.title} primaryUrl={art.primary_image_url} sku={art.sku} className={styles.img} />
            </Link>
            <div className={styles.body}>
              <div className={styles.head}>
                <div>
                  <p className={styles.kicker}>{art.sku} · {new Date(offer.created_at).toLocaleDateString(locale)}</p>
                  <h3 className={styles.title}>{art.title || t('Obra', 'Artwork')}</h3>
                </div>
                <Tag type={s.type} size="sm">{t(s.es, s.en)}</Tag>
              </div>
              <dl className={styles.meta}>
                <div><dt>{t('Oferta', 'Offer')}</dt><dd className={styles.amount}>{money(offer.offer_amount_mxn)}</dd></div>
                {list ? <div><dt>{t('Precio de lista', 'List price')}</dt><dd>{money(list)}</dd></div> : null}
                {admin && (
                  <div><dt>{t('Coleccionista', 'Collector')}</dt><dd>{offer.guest_name}<br /><a href={`mailto:${offer.guest_email}`}>{offer.guest_email}</a></dd></div>
                )}
              </dl>
              {offer.message ? <p className={styles.message}>“{offer.message}”</p> : null}
              {admin && onStatusChange && (
                <div className={styles.actions}>
                  <Button size="sm" kind="primary" disabled={updatingId === offer.id || offer.status === 'ACCEPTED'} onClick={() => onStatusChange(offer.id, 'ACCEPTED')}>{t('Aceptar', 'Accept')}</Button>
                  <Button size="sm" kind="tertiary" disabled={updatingId === offer.id || offer.status === 'REJECTED'} onClick={() => onStatusChange(offer.id, 'REJECTED')}>{t('Rechazar', 'Decline')}</Button>
                  {offer.status !== 'PENDING' && (
                    <Button size="sm" kind="ghost" disabled={updatingId === offer.id} onClick={() => onStatusChange(offer.id, 'PENDING')}>{t('Marcar pendiente', 'Mark pending')}</Button>
                  )}
                  <Button size="sm" kind="ghost" renderIcon={Email} href={`mailto:${offer.guest_email}?subject=${encodeURIComponent(`JBU · ${art.title || ''}`)}`}>{t('Responder', 'Reply')}</Button>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
