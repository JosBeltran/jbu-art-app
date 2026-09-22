'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { Button, InlineNotification } from '@carbon/react'
import { Close, TrashCan, ArrowRight, ShoppingCart } from '@carbon/icons-react'
import styles from './CartDrawer.module.css'

const money = (n) => `$${Number(n || 0).toLocaleString('es-MX')} MXN`

export default function CartDrawer({ isOpen, onClose }) {
  const { cart, removeFromCart, total, clearCart } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  if (!isOpen) return null

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setLoading(true)
    setError('')

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
        setError(data.error || 'No se pudo generar la sesión de pago.')
      }
    } catch (err) {
      console.error('Error procesando checkout:', err)
      setError('Error de conexión con la pasarela de pago.')
    } finally {
      setLoading(false)
    }
  }

  const goToCatalog = () => {
    onClose()
    router.push('/catalog')
  }

  const totalItems = cart.reduce((acc, i) => acc + (i.quantity || 1), 0)

  return (
    <div className={styles.overlay}>
      {/* Fondo semitransparente */}
      <button
        type="button"
        aria-label="Cerrar carrito"
        className={styles.backdrop}
        onClick={onClose}
      />

      {/* Panel del carrito */}
      <aside className={styles.panel} aria-label="Carrito de compras">
        {/* Encabezado */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            Tu carrito <span className={styles.count}>({totalItems})</span>
          </h2>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Close}
            iconDescription="Cerrar carrito"
            onClick={onClose}
          />
        </div>

        {/* Lista de ítems */}
        <div className={styles.items}>
          {cart.length === 0 ? (
            <div className={styles.empty}>
              <ShoppingCart size={40} className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>Tu carrito está vacío</p>
              <p className={styles.emptyText}>
                Explora el catálogo para agregar obras o ediciones a tu colección.
              </p>
              <Button kind="tertiary" size="sm" renderIcon={ArrowRight} onClick={goToCatalog}>
                Explorar obras
              </Button>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={`${item.id}-${idx}`} className={styles.item}>
                <div className={styles.thumb}>
                  <ArtworkImage
                    title={item.title}
                    primaryUrl={item.image}
                    sku={item.sku}
                    className={styles.thumbImg}
                  />
                </div>

                <div className={styles.itemMeta}>
                  <h3 className={styles.itemTitle}>{item.title}</h3>
                  <p className={styles.itemSku}>SKU {item.sku || 'N/A'}</p>
                  <p className={styles.itemPrice}>{money(item.price)}</p>
                </div>

                <Button
                  kind="danger--ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={TrashCan}
                  iconDescription="Quitar del carrito"
                  onClick={() => removeFromCart(item.id)}
                />
              </div>
            ))
          )}
        </div>

        {/* Pie */}
        {cart.length > 0 && (
          <div className={styles.footer}>
            {error && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton={false}
                onCloseButtonClick={() => setError('')}
                title="No se pudo procesar el pago"
                subtitle={error}
                className={styles.notification}
              />
            )}

            <div className={styles.subtotalRow}>
              <span className={styles.subtotalLabel}>Subtotal</span>
              <span className={styles.subtotalValue}>{money(total)}</span>
            </div>
            <p className={styles.note}>
              Impuestos y envío se calculan al momento del pago.
            </p>

            <Button
              kind="primary"
              renderIcon={ArrowRight}
              onClick={handleCheckout}
              disabled={loading}
              className={styles.checkoutButton}
            >
              {loading ? 'Redirigiendo a Stripe…' : 'Proceder al pago'}
            </Button>

            <Button kind="ghost" size="sm" onClick={clearCart} className={styles.clearButton}>
              Vaciar carrito
            </Button>
          </div>
        )}
      </aside>
    </div>
  )
}
