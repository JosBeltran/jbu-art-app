'use client'

import { useState } from 'react'

export default function BuyButton({ artworkId, price, status }) {
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

      if (!response.ok) {
        throw new Error(data.error || 'Error al iniciar el pago.')
      }

      // Redirigir a la pantalla de pago segura de Stripe
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  if (status !== 'AVAILABLE') {
    return (
      <button
        disabled
        className="w-full py-3 bg-neutral-800 text-neutral-500 font-mono text-xs rounded-lg cursor-not-allowed uppercase"
      >
        {status === 'CLAIMED' ? 'Obra Adquirida' : 'No Disponible'}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-mono font-bold text-xs rounded-lg transition"
      >
        {loading ? 'Procesando...' : `Adquirir Obra — $${Number(price).toLocaleString('es-MX')} MXN`}
      </button>

      {error && (
        <p className="text-[10px] font-mono text-red-400 text-center">
          🚨 {error}
        </p>
      )}
    </div>
  )
}