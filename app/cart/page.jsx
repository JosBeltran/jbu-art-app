'use client'

import { useCart } from '@/context/CartContext'
import { useState, useEffect } from 'react'
import { Button, InlineLoading } from '@carbon/react'
import { ShoppingCart, TrashCan, ArrowRight, Login } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'

export default function CartDrawer() {
  const { t, locale } = useI18n()
  const { cart, removeFromCart, total, clearCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    async function checkUserSession() {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
      setCheckingAuth(false)
    }
    checkUserSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const handleCheckout = async () => {
    if (!user) {
      const currentPath = window.location.pathname
      window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartItems: cart, userId: user.id }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || t('Error al procesar el checkout', 'Error processing checkout'))
      }
    } catch (err) {
      console.error(err)
      alert(t('Error al conectar con la pasarela de pago', 'Error connecting to the payment gateway'))
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <InlineLoading description={t('Verificando sesión...', 'Checking session...')} />
      </div>
    )
  }

  if (cart.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
        <ShoppingCart size={32} style={{ marginBottom: '0.5rem' }} />
        <p style={{ fontSize: '0.875rem', margin: 0 }}>{t('Tu carrito está vacío', 'Your cart is empty')}</p>
      </div>
    )
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%', 
      backgroundColor: 'var(--cds-background)', 
      color: 'var(--cds-text-primary)',
      padding: '1.5rem',
      boxSizing: 'border-box'
    }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '600', margin: 0 }}>
          {t('Tu Carrito', 'Your Cart')} ({cart.length})
        </h2>
        <button
          onClick={clearCart}
          style={{ background: 'none', border: 'none', color: 'var(--cds-link-primary)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
        >
          {t('Vaciar carrito', 'Empty cart')}
        </button>
      </div>

      {/* Lista de Items con Scroll propio si es larga */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
        {cart.map((item, idx) => (
          <div 
            key={idx} 
            style={{ 
              display: 'flex', 
              gap: '1rem', 
              alignItems: 'center', 
              backgroundColor: 'var(--cds-layer-01)', 
              padding: '0.75rem', 
              borderRadius: '4px',
              border: '1px solid var(--cds-border-subtle)'
            }}
          >
            {/* Miniatura de la obra */}
            {item.image_url ? (
              <img 
                src={item.image_url} 
                alt={item.title} 
                style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '2px' }} 
              />
            ) : (
              <div style={{ width: '50px', height: '50px', backgroundColor: 'var(--cds-layer-02)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                {t('Arte', 'Art')}
              </div>
            )}

            {/* Información */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.875rem', fontWeight: '600', margin: '0 0 0.25rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.title}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0 0 0.25rem 0' }}>
                SKU: {item.sku || item.id}
              </p>
              <p style={{ fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--cds-interactive)', margin: 0 }}>
                ${Number(item.price || 0).toLocaleString(locale)} MXN
              </p>
            </div>

            {/* Botón Eliminar */}
            <button
              onClick={() => removeFromCart(item.id, item.type)}
              style={{ background: 'none', border: 'none', color: 'var(--cds-support-error)', cursor: 'pointer', fontSize: '0.75rem', padding: '0.25rem' }}
              title={t('Eliminar', 'Remove')}
            >
              {t('Eliminar', 'Remove')}
            </button>
          </div>
        ))}
      </div>

      {/* Sección Inferior fija: Subtotal y Botón de Pago */}
      <div style={{ borderTop: '1px solid var(--cds-border-subtle)', paddingTop: '1rem', marginTop: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--cds-text-secondary)', letterSpacing: '0.5px' }}>
            {t('SUBTOTAL', 'SUBTOTAL')}
          </span>
          <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>
            ${Number(total || 0).toLocaleString(locale)} MXN
          </span>
        </div>

        {!user ? (
          <Button
            kind="tertiary"
            renderIcon={Login}
            onClick={handleCheckout}
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            {t('Inicia Sesión para Pagar', 'Sign In to Pay')}
          </Button>
        ) : (
          <Button
            kind="primary"
            renderIcon={ArrowRight}
            onClick={handleCheckout}
            disabled={loading}
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            {loading ? t('Procesando...', 'Processing...') : t('PROCEDER AL PAGO →', 'PROCEED TO PAYMENT →')}
          </Button>
        )}
      </div>

    </div>
  )
}