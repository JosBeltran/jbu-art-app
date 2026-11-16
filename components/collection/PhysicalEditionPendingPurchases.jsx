'use client'
import { InlineLoading, InlineNotification, Button } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import PhysicalEditionPendingPurchase from '@/components/PhysicalEditionPendingPurchase'
import usePhysicalEditionPurchases from '@/components/usePhysicalEditionPurchases'

export default function PhysicalEditionPendingPurchases({ userId }) {
  const { t } = useI18n()
  const { purchases, busy, failed, refresh } = usePhysicalEditionPurchases(userId)
  return <section aria-label={t('Compras pendientes', 'Pending purchases')}>
    <h2>{t('Compras pendientes', 'Pending purchases')}</h2>
    {busy && <InlineLoading description={t('Consultando reservas…', 'Checking reservations…')} />}
    {failed && <InlineNotification kind="error" hideCloseButton title={t('No se pudieron consultar las reservas', 'Reservations could not be loaded')}
      subtitle={t('No se ha confirmado una lista vacía. Actualiza el estado para volver a intentar.', 'An empty list has not been confirmed. Refresh the status to try again.')} />}
    {failed && <Button kind="ghost" onClick={() => refresh()} disabled={busy}>{t('Actualizar estado', 'Refresh status')}</Button>}
    {!busy && !failed && purchases.length === 0 && <p>{t('No tienes compras pendientes de ediciones físicas.', 'You have no pending physical edition purchases.')}</p>}
    {purchases.map(purchase => <PhysicalEditionPendingPurchase key={purchase.artwork.id} purchase={purchase} busy={busy}
      onRefresh={() => refresh()} onCancel={() => refresh(purchase.artwork.id)} />)}
  </section>
}
