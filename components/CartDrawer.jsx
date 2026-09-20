'use client'

import { useState } from 'react'
import { useCart } from '@/context/CartContext'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { Button, InlineLoading, Theme } from '@carbon/react'
import { Close, TrashCan, ArrowRight, ShoppingCart } from '@carbon/icons-react'

export default function CartDrawer({ isOpen, onClose }) {
  const { cart, removeFromCart, total, clearCart } = useCart()
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id || null

      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          cartItems: cart,
          userId: userId
        }),
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

  const totalItems = cart.reduce((acc, i) => acc + (i.quantity || 1), 0)

  return (
    // Forzamos el tema g100 para que combine con la estética oscura de tu galería
    <Theme theme="g10" className="fixed inset-0 z-50 flex justify-end">
      
      {/* Fondo semitransparente */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Contenido del Drawer usando tokens y estilos de Carbon */}
      <div 
        className="relative w-full max-w-md h-full flex flex-col z-10 shadow-2xl"
        style={{ 
          backgroundColor: 'var(--cds-background)', 
          borderLeft: '1px solid var(--cds-border-subtle)',
          color: 'var(--cds-text-primary)',
          padding: '1.5rem',
          boxSizing: 'border-box'
        }}
      >
        
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--cds-border-subtle)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', margin: 0 }}>
            Tu Carrito ({totalItems})
          </h2>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Close}
            iconDescription="Cerrar carrito"
            onClick={onClose}
            style={{ color: 'var(--cds-text-primary)' }}
          />
        </div>

        {/* Lista de Ítems */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cart.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: '0.75rem' }}>
              <ShoppingCart size={32} style={{ color: 'var(--cds-text-secondary)' }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)', margin: 0 }}>Tu carrito está vacío.</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0 }}>Explora el catálogo para agregar obras de arte o ediciones.</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div 
                key={`${item.id}-${idx}`} 
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
                {/* Miniatura usando ArtworkImage */}
                <div style={{ width: '50px', height: '50px', borderRadius: '2px', overflow: 'hidden', flexShrink: '0', position: 'relative' }}>
                  <ArtworkImage
                    title={item.title}
                    primaryUrl={item.image}
                    sku={item.sku}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--cds-text-primary)', margin: '0 0 0.25rem 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0 0 0.25rem 0' }}>
                    SKU: {item.sku || 'N/A'}
                  </p>
                  <p style={{ fontSize: '0.875rem', fontWeight: 'bold', color: 'var(--cds-interactive)', margin: 0 }}>
                    ${Number(item.price || 0).toLocaleString('es-MX')} MXN
                  </p>
                </div>

                <Button
                  kind="danger--ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={TrashCan}
                  iconDescription="Quitar obra"
                  onClick={() => removeFromCart(item.id)}
                  style={{ minHeight: '2rem', minWidth: '2rem' }}
                />
              </div>
            ))
          )}
        </div>

        {/* Pie de página */}
        {cart.length > 0 && (
          <div style={{ borderTop: '1px solid var(--cds-border-subtle)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Subtotal
              </span>
              <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>
                ${Number(total || 0).toLocaleString('es-MX')} MXN
              </span>
            </div>

            <Button
              kind="primary"
              renderIcon={ArrowRight}
              onClick={handleCheckout}
              disabled={loading}
              style={{ width: '100%', justifyContent: 'space-between' }}
            >
              {loading ? 'Redirigiendo a Stripe...' : 'PROCEDER AL PAGO →'}
            </Button>

            <button
              onClick={clearCart}
              style={{ background: 'none', border: 'none', color: 'var(--cds-link-primary)', fontSize: '0.75rem', cursor: 'pointer', textAlign: 'center', width: '100%', padding: '0.25rem' }}
            >
              Vaciar carrito
            </button>
          </div>
        )}

      </div>
    </Theme>
  )
}