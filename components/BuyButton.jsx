'use client'

import { useState } from 'react'
import { Button, InlineNotification } from '@carbon/react'
import { ShoppingCart } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'

export default function BuyButton({ artworkId, price, status, compact = false }) {
  const { t, locale } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCheckout = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || t('Error al iniciar el pago.', 'Error starting the payment.'))
      if (data.url) window.location.href = data.url
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
        kind="primary"
        size={compact ? 'sm' : 'md'}
        renderIcon={ShoppingCart}
        disabled={loading}
        onClick={handleCheckout}
      >
        {loading ? t('Procesando…', 'Processing…') : compact ? t('Adquirir', 'Acquire') : `${t('Adquirir obra', 'Acquire artwork')} — $${Number(price || 0).toLocaleString(locale)} MXN`}
      </Button>
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title={t('No se pudo iniciar el pago', 'Could not start the payment')} subtitle={error} />}
    </div>
  )
}
