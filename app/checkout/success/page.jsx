'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useCart } from '@/context/CartContext' // 👈 Ajusta si la ruta de tu CartContext difiere

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  


  // Consumir la función de vaciado o refresco del contexto si la tienes expuesta
  const cartContext = useCart ? useCart() : null
  const clearCart = cartContext?.clearCart || cartContext?.fetchCart

  const cleanedRef = useRef(false)

  useEffect(() => {
    if (!sessionId || cleanedRef.current) return
    cleanedRef.current = true

    const clearDatabaseCart = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          // 1. Vaciar los ítems del usuario en la tabla cart_items
          const { error } = await supabase
            .from('cart_items')
            .delete()
            .eq('user_id', user.id)

          if (error) {
            console.error('Error al limpiar el carrito en Supabase:', error.message)
          }

          // 2. Refrescar / Vaciar el contexto del cliente para reactivar el Badge o Drawer
          if (clearCart) {
            clearCart()
          }
        }
      } catch (err) {
        console.error('Excepción al procesar vaciado de carrito post-pago:', err)
      }
    }

    clearDatabaseCart()
  }, [sessionId, supabase, clearCart])

  return (
    <div className="max-w-md w-full bg-violet-900 border border-violet-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
      <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 text-2xl">
        ✓
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-light text-white">
          Adquisición Confirmada
        </h1>
        <p className="text-xs font-mono text-violet-400 leading-relaxed">
          El proceso de pago se ha completado con éxito. Hemos registrado tu transacción.
        </p>
      </div>

      {sessionId && (
        <div className="bg-violet-950 p-3 rounded-lg border border-violet-800/80 text-left">
          <span className="block text-[10px] font-mono text-violet-500 uppercase tracking-wider mb-1">
            ID de Confirmación
          </span>
          <p className="text-[11px] font-mono text-violet-300 truncate">
            {sessionId}
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-violet-800 space-y-3">
        <Link
          href="/collection"
          className="block w-full py-3 bg-amber-500 hover:bg-amber-400 text-violet-950 font-mono font-bold text-xs rounded-lg transition"
        >
          Volver a la Colección
        </Link>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-violet-950 text-violet-100 flex items-center justify-center p-6">
      <Suspense fallback={
        <div className="text-xs font-mono text-violet-500">Cargando confirmación...</div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  )
}