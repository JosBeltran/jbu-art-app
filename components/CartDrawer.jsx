'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { Button, InlineNotification } from '@carbon/react'
import { Close, TrashCan, ArrowRight, ShoppingCart } from '@carbon/icons-react'
import styles from './CartDrawer.module.css'
import { useI18n } from '@/components/I18nProvider'

export default function CartDrawer({ isOpen, onClose }) {
  const { t, locale } = useI18n()
  const money = (n) => `$${Number(n || 0).toLocaleString(locale)} MXN`
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
        setError(data.error || t('No se pudo generar la sesión de pago.', 'Could not create the payment session.'))
      }
    } catch (err) {
      console.error('Error procesando checkout:', err)
      setError(t('Error de conexión con la pasarela de pago.', 'Connection error with the payment gateway.'))
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
        aria-label={t('Cerrar carrito', 'Close cart')}
        className={styles.backdrop}
        onClick={onClose}
      />

      {/* Panel del carrito */}
      <aside className={styles.panel} aria-label={t('Carrito de compras', 'Shopping cart')}>
        {/* Encabezado */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            {t('Tu carrito', 'Your cart')} <span className={styles.count}>({totalItems})</span>
          </h2>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Close}
            iconDescription={t('Cerrar carrito', 'Close cart')}
            onClick={onClose}
          />
        </div>

        {/* Lista de ítems */}
        <div className={styles.items}>
          {cart.length === 0 ? (
            <div className={styles.empty}>
              <ShoppingCart size={40} className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>{t('Tu carrito está vacío', 'Your cart is empty')}</p>
              <p className={styles.emptyText}>
                {t('Explora el catálogo para agregar obras o ediciones a tu colección.', 'Browse the catalog to add artworks or editions to your collection.')}
              </p>
              <Button kind="tertiary" size="sm" renderIcon={ArrowRight} onClick={goToCatalog}>
                {t('Explorar obras', 'Explore artworks')}
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
                  <p className={styles.itemSku}>SKU {item.sku || t('N/D', 'N/A')}</p>
                  <p className={styles.itemPrice}>{money(item.price)}</p>
                </div>

                <Button
                  kind="danger--ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={TrashCan}
                  iconDescription={t('Quitar del carrito', 'Remove from cart')}
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
                title={t('No se pudo procesar el pago', 'Could not process payment')}
                subtitle={error}
                className={styles.notification}
              />
            )}

            <div className={styles.subtotalRow}>
              <span className={styles.subtotalLabel}>{t('Subtotal', 'Subtotal')}</span>
              <span className={styles.subtotalValue}>{money(total)}</span>
            </div>
            <p className={styles.note}>
              {t('Impuestos y envío se calculan al momento del pago.', 'Taxes and shipping are calculated at checkout.')}
            </p>

            <Button
              kind="primary"
              renderIcon={ArrowRight}
              onClick={handleCheckout}
              disabled={loading}
              className={styles.checkoutButton}
            >
              {loading ? t('Redirigiendo a Stripe…', 'Redirecting to Stripe…') : t('Proceder al pago', 'Proceed to payment')}
            </Button>

            <Button kind="ghost" size="sm" onClick={clearCart} className={styles.clearButton}>
              {t('Vaciar carrito', 'Empty cart')}
            </Button>
          </div>
        )}
      </aside>
    </div>
  )
}
