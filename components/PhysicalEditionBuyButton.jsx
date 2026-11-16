'use client'
import { shippingCheckoutFetch } from '@/components/shipping/ShippingProvider'
import { shippingErrorText } from '@/lib/shippingCountries'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, InlineLoading, InlineNotification } from '@carbon/react'
import { ShoppingCart } from '@carbon/icons-react'
import { useCart } from '@/context/CartContext'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import PhysicalEditionPendingPurchase from '@/components/PhysicalEditionPendingPurchase'
import usePhysicalEditionPurchases from '@/components/usePhysicalEditionPurchases'

export default function PhysicalEditionBuyButton({ artworkId, disabled = false }) {
  const { user } = useCart()
  const { t } = useI18n()
  const router = useRouter()
  const requestKey = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { purchases, busy, failed, checked, refresh } = usePhysicalEditionPurchases(user?.id, artworkId)
  const purchase = purchases[0]
  const pending = Boolean(purchase && !purchase.canStartNew)
  const returned = useSearchParams().get('canceled') === 'true'
  useEffect(() => { requestKey.current = null }, [user?.id, artworkId])

  const errors = {
    auth_required: t('Inicia sesión y confirma tu correo para comprar.', 'Sign in and verify your email to purchase.'),
    verified_buyer_required: t('Confirma tu correo y vuelve a intentar.', 'Verify your email and try again.'),
    edition_sold_out_or_reserved: t('Por ahora no quedan ejemplares disponibles. Vuelve a consultar el inventario.', 'No units are available right now. Check availability again shortly.'),
    edition_not_for_sale: t('La edición ya no está disponible para compra. Actualiza la ficha.', 'The edition is no longer on sale. Refresh the artwork page.'),
    checkout_session_not_open: t('La sesión anterior ya terminó. Vuelve a intentar para iniciar una nueva.', 'The previous checkout ended. Try again to start a new one.'),
    edition_checkout_unavailable: t('El pago no pudo iniciarse. Intenta de nuevo en unos momentos.', 'Payment could not start. Try again in a moment.'),
  }
  errors.checkout_request_not_reusable = errors.checkout_session_not_open

  async function buy() {
    if (loading || disabled || busy) return
    if (!user) {
      const next = window.location.pathname + window.location.search
      router.push(`/login?redirect=${encodeURIComponent(next)}`)
      return
    }
    setLoading(true)
    setError('')
    try {
      const latest = await refresh()
      if (!latest) throw new Error('edition_checkout_unavailable')
      if (latest[0] && !latest[0].canStartNew) return
      if (latest[0]?.canStartNew) requestKey.current = null
      if (!requestKey.current) requestKey.current = crypto.randomUUID()
      const response = await shippingCheckoutFetch('/api/checkout/physical-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ artworkId, requestKey: requestKey.current }),
      })
      const data = await response.json()
      if (data.purchase || ['edition_checkout_already_open', 'edition_purchase_pending'].includes(data.error)) {
        requestKey.current = null
        await refresh()
        if (!data.url) return
      }
      if (!response.ok || !data.url) throw new Error(data.error || 'edition_checkout_unavailable')
      window.location.assign(data.url)
    } catch (err) {
      const code = err?.message || 'edition_checkout_unavailable'
      if (['checkout_session_not_open', 'checkout_request_not_reusable'].includes(code)) requestKey.current = null
      setError(code)
      await refresh()
      window.dispatchEvent(new Event('jbu:edition-inventory-changed'))
    } finally {
      setLoading(false)
    }
  }

  return <div>
    {!user && <p>{t('Necesitas una cuenta de coleccionista para comprar y registrar tu ejemplar.', 'A collector account is required to purchase and register your unit.')}</p>}
    {returned && <InlineNotification lowContrast kind="info" hideCloseButton
      title={t('Regresaste del pago', 'You returned from checkout')}
      subtitle={t('Volver a la obra no cancela tu reserva. Consulta su estado para continuar o cancelarla de forma segura.', 'Returning to the artwork does not cancel your reservation. Check its status to continue or safely cancel.')} />}
    {purchase && <PhysicalEditionPendingPurchase purchase={purchase} busy={busy || loading}
      onRefresh={() => refresh()} onCancel={async () => { requestKey.current = null; await refresh(artworkId) }} />}
    {failed && <InlineNotification lowContrast kind="warning" hideCloseButton
      title={t('No pudimos verificar el pago pendiente', 'We could not check pending payment')}
      subtitle={t('Actualiza el estado antes de continuar.', 'Refresh the status before continuing.')} />}
    {failed && <Button kind="ghost" disabled={busy || loading} onClick={() => refresh()}>{t('Actualizar estado', 'Refresh status')}</Button>}
    {!pending && <Button kind="primary" renderIcon={ShoppingCart} onClick={buy}
      disabled={disabled || loading || busy || (Boolean(user) && (!checked || failed))}>
      {t('Comprar ejemplar de la edición', 'Buy numbered edition')}
    </Button>}
    {busy && <InlineLoading description={t('Consultando reserva…', 'Checking reservation…')} />}
    {loading && <InlineLoading description={t('Reservando ejemplar…', 'Reserving unit…')} />}
    {error && !pending && <InlineNotification lowContrast kind="error" hideCloseButton
      title={t('No se pudo iniciar la compra', 'Could not start checkout')}
      subtitle={errors[error] || (error.startsWith('shipping_') ? shippingErrorText(error, t) : errors.edition_checkout_unavailable)} />}
  </div>
}
