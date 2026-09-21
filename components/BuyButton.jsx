'use client'

import { useState } from 'react'
import { Button, InlineNotification } from '@carbon/react'
import { ShoppingCart } from '@carbon/icons-react'

export default function BuyButton({ artworkId, price, status, compact = false }) {
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
      if (!response.ok) throw new Error(data.error || 'Error al iniciar el pago.')
      if (data.url) window.location.href = data.url
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Error al iniciar el pago.')
      setLoading(false)
    }
  }

  if (status !== 'AVAILABLE') {
    return <Button kind="secondary" size={compact ? 'sm' : 'md'} disabled>No disponible</Button>
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
        {loading ? 'Procesando…' : compact ? 'Adquirir' : `Adquirir obra — $${Number(price || 0).toLocaleString('es-MX')} MXN`}
      </Button>
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title="No se pudo iniciar el pago" subtitle={error} />}
    </div>
  )
}
