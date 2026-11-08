'use client'

import { authHeaders } from '@/lib/authHeaders'
import PaymentDelivery from '@/components/delivery/PaymentDelivery'
import WelcomePromoBadge from '@/components/promo/WelcomePromoBadge'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/context/CartContext'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { Button, InlineNotification } from '@carbon/react'
import { Close, TrashCan, ArrowRight, ShoppingCart } from '@carbon/icons-react'
import styles from './CartDrawer.module.css'
import { useI18n } from '@/components/I18nProvider'
import { useCurrency, ExchangeNote } from '@/components/CurrencyProvider'

export default function CartDrawer({ isOpen, onClose }) {
  const { t, locale } = useI18n()
  const { price: displayPrice, total: displayTotal, currency, chargeCurrency } = useCurrency()
  const money = (n) => displayPrice(n || 0).text
  const { cart, removeFromCart, clearCart, user } = useCart()
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

      const allPrints = cart.length > 0 && cart.every(i => i.type === 'PRINT' && i.variantId)
    const printOnly = allPrints && cart.every(i => i.edition_type === 'OPEN')
      if (!userId && !printOnly) {
        router.push('/login?redirect=' + encodeURIComponent('/cart'))
        return
      }
      if (!allPrints && cart.some(i => i.type === 'PRINT')) {
        setError(t('Compra los prints por separado de los originales.', 'Please check out prints separately from originals.'))
        return
      }
      const res = await fetch(printOnly ? '/api/checkout/open-edition' : '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          cartItems: cart,
          userId: userId,
          currency: chargeCurrency
        }),
      })

      const data = await res.json()
      if (data.url) {
        if (printOnly && data.session_id && data.guest_access_token) {
          try { sessionStorage.setItem('jbu_open_print_access:' + data.session_id, data.guest_access_token) } catch {}
        }
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
                {t('Explorar', 'Explore')}
              </Button>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={`${item.type}-${item.id}-${item.variantId || idx}`} className={styles.item}>
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
                  {item.type === 'PRINT' && <p className={styles.itemSku}>{item.edition_type === 'LIMITED' ? t('Print edición limitada', 'Limited Edition Print') : t('Print edición abierta', 'Open Edition Print')} · {item.size} · {item.finish}</p>}
                  <p className={styles.itemPrice}>{money(item.price)}</p>
                </div>

                <Button
                  kind="danger--ghost"
                  size="sm"
                  hasIconOnly
                  renderIcon={TrashCan}
                  iconDescription={t('Quitar del carrito', 'Remove from cart')}
                  onClick={() => removeFromCart(item.id, item.type, item.variantId)}
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

            {user && <WelcomePromoBadge />}
            <div className={styles.subtotalRow}>
              <span className={styles.subtotalLabel}>{t('Subtotal', 'Subtotal')}</span>
              <span className={styles.subtotalValue}>{displayTotal(cart).text}</span>
            </div>
            <p className={styles.note}>
              {t('Impuestos y envío se calculan al momento del pago.', 'Taxes and shipping are calculated at checkout.')}
              {displayTotal(cart).approximate && <ExchangeNote />}
            </p>

            {cart.every(i => i.type === 'PRINT' && i.variantId && i.edition_type === 'OPEN')
              ? <Button onClick={handleCheckout} disabled={loading} className={styles.checkoutButton}>{t('Pagar reproducciones', 'Checkout prints')}</Button>
              : <PaymentDelivery items={cart} onOnline={handleCheckout} disabled={loading} onlineLabel={t('Proceder al pago', 'Proceed to payment')} />}

            <Button kind="ghost" size="sm" onClick={clearCart} className={styles.clearButton}>
              {t('Vaciar carrito', 'Empty cart')}
            </Button>
          </div>
        )}
      </aside>
    </div>
  )
}
