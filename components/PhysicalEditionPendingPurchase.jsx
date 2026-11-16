'use client'

import ArtworkImage from '@/components/ArtworkImage'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { Button, InlineNotification, Tag } from '@carbon/react'
import styles from './PhysicalEditionPendingPurchase.module.css'

export default function PhysicalEditionPendingPurchase({ purchase, busy = false, onCancel, onRefresh }) {
  const { t, locale } = useI18n()
  const localized = useLocalized()
  const art = purchase.artwork || {}
  const title = localized(art, 'title')
  const messages = {
    open: t('Tu ejemplar sigue reservado. Continúa el mismo pago con su destino, moneda y envío originales.', 'Your unit is still reserved. Continue the same payment with its original destination, currency and shipping.'),
    preparing: t('Estamos preparando el pago. Actualiza el estado o cancela la reserva para volver a empezar.', 'Checkout is being prepared. Refresh its status or cancel the reservation to start again.'),
    expired: t('El pago venció sin completarse y la reserva fue liberada. Puedes iniciar una nueva compra.', 'Checkout expired without payment and the reservation was released. You can start a new purchase.'),
    cancelled: t('La reserva fue cancelada de forma segura. Puedes iniciar una nueva compra.', 'The reservation was safely cancelled. You can start a new purchase.'),
    paid: t('Pago recibido. Consulta tu pedido en la colección.', 'Payment received. View your order in your collection.'),
    paid_pending_fulfillment: t('Pago recibido. Estamos confirmando tu pedido; no vuelvas a pagar.', 'Payment received. We are confirming your order; please do not pay again.'),
    processing: t('El pago está en proceso. Conservamos tu ejemplar mientras se confirma.', 'Payment is processing. Your unit remains reserved while payment is confirmed.'),
    unresolved: t('Aún no pudimos confirmar el estado del pago. Conservamos tu ejemplar por seguridad. Actualiza el estado; si persiste, contacta a soporte.', 'We could not yet confirm payment status. Your unit remains reserved for safety. Refresh the status; if this persists, contact support.'),
  }
  const reserved = purchase.reservationStatus === 'HELD'
  const heading = purchase.canStartNew ? t('Reserva finalizada', 'Reservation ended')
    : purchase.state === 'paid' ? t('Compra confirmada', 'Purchase confirmed')
      : t('Compra pendiente', 'Pending purchase')
  return <article className={styles.card} aria-busy={busy}>
    {art.primary_image_url && <ArtworkImage title={title} primaryUrl={art.primary_image_url} sku={art.sku} className={styles.image} />}
    <div className={styles.body}>
      <h3>{heading}</h3>
      <p>{title}</p>
      <Tag type={reserved ? 'purple' : 'gray'}>{reserved ? t('Ejemplar reservado', 'Unit reserved') : t('Reserva finalizada', 'Reservation ended')}</Tag>
      {purchase.unit?.unit_identifier && <p>{purchase.unit.unit_identifier}</p>}
      <p role="status">{messages[purchase.state] || messages.unresolved}</p>
      {purchase.sessionStatus && <p>{t('Sesión de pago', 'Payment session')}: {({
        open: t('Abierta', 'Open'), expired: t('Vencida', 'Expired'), complete: t('Completada', 'Complete'),
      })[purchase.sessionStatus] || t('Por confirmar', 'Awaiting confirmation')}</p>}
      {purchase.expiresAt && <p>{t('Vencimiento del pago', 'Checkout expiration')}: <time dateTime={purchase.expiresAt}>{new Date(purchase.expiresAt).toLocaleString(locale)}</time></p>}
      <div className={styles.actions}>
        {purchase.resumeUrl && <Button as="a" href={purchase.resumeUrl} disabled={busy}>{t('Continuar pago', 'Continue payment')}</Button>}
        {purchase.canCancel && <Button kind="danger--tertiary" disabled={busy} onClick={onCancel}>{t('Cancelar reserva', 'Cancel reservation')}</Button>}
        <Button kind="ghost" disabled={busy} onClick={onRefresh}>{t('Actualizar estado', 'Refresh status')}</Button>
        {purchase.orderId && <Button as="a" href={`/orders/${purchase.orderId}`} kind="ghost">{t('Ver pedido', 'View order')}</Button>}
      </div>
      {busy && <InlineNotification kind="info" hideCloseButton title={t('Verificando con Stripe…', 'Checking with Stripe…')} />}
    </div>
  </article>
}
