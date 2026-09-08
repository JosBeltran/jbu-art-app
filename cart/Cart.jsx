'use client'

import { useCart } from '@/context/CartContext'
import { useState } from 'react'

export default function CartDrawer() {
  const { cart, removeFromCart, total, clearCart } = useCart()
  const [loading, setLoading] = useState(false)

  const handleCheckout = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartItems: cart }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Error al procesar el checkout')
      }
    } catch (err) {
      console.error(err)
      alert('Error al conectar con la pasarela de pago')
    } finally {
      setLoading(false)
    }
  }

  if (cart.length === 0) return <div>El carrito está vacío</div>

  return (
    <div className="p-6 bg-white border rounded-xl space-y-4">
      <h2 className="text-xl font-bold">Tu Carrito ({cart.length})</h2>

      <div className="divide-y">
        {cart.map((item, idx) => (
          <div key={idx} className="py-3 flex justify-between items-center">
            <div>
              <p className="font-bold text-sm">{item.title}</p>
              <p className="text-xs text-gray-500">${item.price?.toLocaleString()} MXN</p>
            </div>
            <button
              onClick={() => removeFromCart(item.id, item.type)}
              className="text-xs text-red-600 font-semibold"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>

      <div className="border-t pt-4 flex justify-between items-center font-bold text-lg">
        <span>Total:</span>
        <span>${total.toLocaleString()} MXN</span>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full bg-black text-white py-3 rounded-lg font-bold text-sm hover:bg-gray-800 transition disabled:opacity-50"
      >
        {loading ? 'Procesando...' : 'Pagar Carrito con Stripe →'}
      </button>
    </div>
  )
}