'use client'

import { shippingErrorText } from '@/lib/shippingCountries'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, InlineNotification } from '@carbon/react'
import { ShoppingCart } from '@carbon/icons-react'
import { useCart } from '@/context/CartContext'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'

// One securely allocated physical edition unit per Stripe Checkout session.
// The unit number is assigned by Supabase, never from the browser.
export default function PhysicalEditionBuyButton({ artworkId, disabled = false }) {
  const { user } = useCart()
  const { t } = useI18n()
  const router = useRouter()
  const requestKey = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function buy() {
    if (!user) {
      const next = window.location.pathname + window.location.search
      router.push(`/login?redirect=${encodeURIComponent(next)}`)
      return
    }
    setLoading(true)
    setError('')
    try {
      if (!requestKey.current) requestKey.current = crypto.randomUUID()
      const response = await fetch('/api/checkout/physical-edition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ artworkId, requestKey: requestKey.current }),
      })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error || 'edition_unavailable')
      window.location.assign(data.url)
    } catch (err) {
      setError(err?.message || 'edition_unavailable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Button kind="primary" renderIcon={ShoppingCart} onClick={buy} disabled={disabled || loading}>
        {loading ? t('Reservando ejemplar…', 'Reserving unit…') : t('Comprar ejemplar numerado', 'Buy numbered edition')}
      </Button>
      {error && <InlineNotification lowContrast kind="error" hideCloseButton
        title={t('No se pudo iniciar la compra', 'Could not start checkout')} subtitle={shippingErrorText(error, t)}/>}
    </div>
  )
}
