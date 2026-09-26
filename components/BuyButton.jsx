'use client'

import { useState } from 'react'
import { Button, InlineNotification } from '@carbon/react'
import { ShoppingCart, Flash } from '@carbon/icons-react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import { useI18n } from '@/components/I18nProvider'

/**
 * @param {{ artworkId: any, sku?: string, title?: string, image?: string, price: any, status?: string, compact?: boolean, className?: string, buyNow?: boolean }} props
 */
export default function BuyButton({ artworkId, sku, title, image, price, status, compact = false, className, buyNow = false }) {
  const router = useRouter()
  const { user } = useCart()
  const { t, locale } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCheckout = async () => {
    if (!user) {
      const destination = window.location.pathname + window.location.search
      router.push(`/login?redirect=${encodeURIComponent(destination)}`)
      return
    }
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
      setError(t('Esta obra aún no tiene un precio de compra válido.', 'This artwork does not have a valid purchase price yet.'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          cartItems: [{ id: artworkId, sku, title, image, type: 'ORIGINAL', price: Number(price), quantity: 1 }],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t('Error al iniciar el pago.', 'Error starting the payment.'))
      if (!data.url) throw new Error(t('No se recibió el enlace de pago.', 'No payment link was returned.'))
      window.location.href = data.url
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : t('Error al iniciar el pago.', 'Error starting the payment.'))
      setLoading(false)
    }
  }

  if (status !== 'AVAILABLE') {
    return <Button kind="secondary" size={compact ? 'sm' : 'md'} disabled>{t('No disponible', 'Not available')}</Button>
  }

  return (
    <div>
      <Button
        type="button"
        className={className}
        kind="primary"
        size={compact ? 'sm' : 'md'}
        renderIcon={buyNow ? Flash : ShoppingCart}
        disabled={loading}
        onClick={handleCheckout}
      >
        {loading ? t('Procesando…', 'Processing…') : buyNow ? t('Comprar ahora', 'Buy now') : compact ? t('Adquirir', 'Acquire') : `${t('Adquirir obra', 'Acquire artwork')} — $${Number(price || 0).toLocaleString(locale)} MXN`}
      </Button>
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title={t('No se pudo iniciar el pago', 'Could not start the payment')} subtitle={error} />}
    </div>
  )
}
