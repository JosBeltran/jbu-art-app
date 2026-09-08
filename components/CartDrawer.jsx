// components/CartDrawer.jsx
'use client'

import { useState } from 'react'
import { useCart } from '@/context/CartContext'

export default function CartDrawer({ isOpen, onClose }) {
  const { cart, removeFromCart, total, clearCart } = useCart()
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  // Helper para asegurar que la URL de la imagen esté bien formateada
  const formatImgSrc = (url) => {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
      return url
    }
    // Si viene de Supabase Storage como ruta relativa
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${url}`
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
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
        alert(data.error || 'No se pudo generar la sesión de pago')
      }
    } catch (err) {
      console.error('Error procesando checkout:', err)
      alert('Error de conexión con la pasarela de pago.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Fondo semitransparente */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Contenido del Drawer */}
      <div className="relative w-full max-w-md bg-neutral-900 border-l border-neutral-800 text-neutral-100 h-full flex flex-col z-10 shadow-2xl p-6">
        
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <h2 className="text-lg font-bold tracking-wider uppercase text-neutral-200">
            Tu Carrito ({cart.reduce((acc, i) => acc + (i.quantity || 1), 0)})
          </h2>
          <button 
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-2 rounded-lg transition"
          >
            ✕
          </button>
        </div>

        {/* Lista de Ítems */}
        <div className="flex-1 overflow-y-auto py-4 divide-y divide-neutral-800">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
              <span className="text-4xl">🎨</span>
              <p className="text-neutral-400 text-sm">Tu carrito está vacío.</p>
              <p className="text-neutral-600 text-xs">Explora el catálogo para agregar obras de arte o ediciones.</p>
            </div>
          ) : (
            cart.map((item, idx) => {
              const rawImgUrl = item.primary_image_url || item.image
              const formattedImg = formatImgSrc(rawImgUrl)

              return (
                <div key={`${item.id}-${idx}`} className="py-4 flex gap-4 items-center">
                <div className="w-16 h-16 rounded bg-neutral-800 border border-neutral-700 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
  {formattedImg ? (
    <img 
      src={formattedImg} 
      alt={item.title} 
      className="w-full h-full object-cover"
      onError={(e) => {
        // Si la ruta local no existe en /public, muestra el fallback visual
        e.currentTarget.style.display = 'none'
        if (e.currentTarget.nextSibling) {
          e.currentTarget.nextSibling.style.display = 'flex'
        }
      }}
    />
  ) : null}
  <span 
    className="text-xl text-neutral-600 hidden items-center justify-center absolute inset-0 bg-neutral-800"
    style={{ display: !formattedImg ? 'flex' : 'none' }}
  >
    🖼️
  </span>
</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm text-neutral-100">{item.title}</h3>
                    <p className="text-xs text-neutral-400">SKU: {item.sku || 'N/A'}</p>
                    <p className="text-xs text-amber-500 mt-1 font-mono">
                      ${item.price?.toLocaleString()} MXN
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.id, item.type)}
                    className="text-xs text-neutral-500 hover:text-red-400 p-1"
                    title="Quitar obra"
                  >
                    Eliminar
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Pie de página con Total y Checkout */}
        {cart.length > 0 && (
          <div className="pt-4 border-t border-neutral-800 space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-neutral-400 uppercase tracking-wider text-xs">Subtotal</span>
              <span className="text-lg font-mono font-bold text-neutral-100">
                ${total.toLocaleString()} MXN
              </span>
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold py-3.5 rounded-lg text-sm tracking-wider uppercase transition-all disabled:opacity-50"
            >
              {loading ? 'Redirigiendo a Stripe...' : 'Proceder al Pago →'}
            </button>

            <button
              onClick={clearCart}
              className="w-full text-center text-xs text-neutral-500 hover:text-neutral-300 transition"
            >
              Vaciar carrito
            </button>
          </div>
        )}
      </div>
    </div>
  )
}