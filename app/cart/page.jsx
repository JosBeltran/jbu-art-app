'use client'
import { catalogMoney, fineArtLineType } from '@/lib/productCatalog/commerce'
import { shippingCheckoutFetch, useShipping } from '@/components/shipping/ShippingProvider'

import { useMarket } from '@/components/market/MarketProvider'
import CartShippingNotice from '@/components/CartShippingNotice'
import { resolveShippingCountries, shippingErrorText } from '@/lib/shippingCountries'
import { authHeaders } from '@/lib/authHeaders'
import PaymentDelivery from '@/components/delivery/PaymentDelivery'
import WelcomePromoBadge from '@/components/promo/WelcomePromoBadge'
import { useCart } from '@/context/CartContext'
import { useState, useEffect } from 'react'
import { Button, InlineLoading, InlineNotification, Select, SelectItem } from '@carbon/react'
import { ShoppingCart, TrashCan, ArrowRight, Login } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { useCurrency, ExchangeNote } from '@/components/CurrencyProvider'

export default function CartDrawer() {
  const { globalCountries } = useShipping()
  const { t, locale } = useI18n()
  const { price: displayPrice, total: displayTotal, chargeCurrency } = useCurrency()
  const { cart, removeFromCart, clearCart, setFineArtQuantity } = useCart()
  const { country } = useMarket()
  const [paymentGroup, setPaymentGroup] = useState('catalog')
  const fineArtLines = cart.filter(item => item.type === fineArtLineType)
  const mixed = fineArtLines.length > 0 && fineArtLines.length < cart.length
  const checkoutItems = mixed ? cart.filter(item => (item.type === fineArtLineType) === (paymentGroup === 'catalog')) : cart
  const hasFineArt = checkoutItems.some(item => item.type === fineArtLineType)
  const shipping = resolveShippingCountries(checkoutItems, globalCountries)
  const catalogCompatible = !hasFineArt || checkoutItems.every(item => item.currency === chargeCurrency && item.destination === country)
  const cartTotal = hasFineArt
    ? catalogCompatible ? { text:catalogMoney(checkoutItems.reduce((total,item)=>total+item.amountMinor*item.quantity,0),chargeCurrency,locale) } : { text:'—' }
    : displayTotal(checkoutItems)
  const marketCompatible = !country || !shipping.requiresShipping || shipping.countries.includes(country)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
    if (!catalogCompatible) return
    if (!resolveShippingCountries(checkoutItems, globalCountries).compatible) return
    const allPrints = checkoutItems.length > 0 && checkoutItems.every(i => i.type === 'PRINT' && i.variantId)
    const printOnly = allPrints && checkoutItems.every(i => i.edition_type === 'OPEN')
    if (!user && !printOnly) {
      window.location.href = '/login?redirect=' + encodeURIComponent('/cart')
      return
    }


    setError('')
    setLoading(true)
    try {
      const res = await shippingCheckoutFetch(printOnly ? '/api/checkout/open-edition' : '/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ cartItems: checkoutItems, userId: user?.id || null, currency: chargeCurrency }),
      })

      const data = await res.json()
      if (data.url) {
        if (printOnly && data.session_id && data.guest_access_token) {
          try { sessionStorage.setItem('jbu_open_print_access:' + data.session_id, data.guest_access_token) } catch {}
        }
        window.location.href = data.url
      } else {
        setError((data.error && shippingErrorText(data.error, t)) || t('Error al procesar el checkout', 'Error processing checkout'))
      }
    } catch (err) {
      console.error(err)
      setError(t('Error al conectar con la pasarela de pago', 'Error connecting to the payment gateway'))
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
      
      <CartShippingNotice items={checkoutItems} />
      {error && <InlineNotification kind="error" title={t('No se pudo procesar el pago', 'Could not process payment')} subtitle={error} onCloseButtonClick={() => setError('')} />}
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
            {(item.image || item.image_url) ? (
              <img 
                src={item.image || item.image_url} 
                alt={item.title}
                onError={(e) => {
                  const fallback = item.primary_image_url
                  if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback
                  else e.currentTarget.style.visibility = 'hidden'
                }}
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
                {item.type === fineArtLineType ? catalogMoney(item.amountMinor,item.currency,locale) : displayPrice(item.price || 0).text}
              </p>
            </div>

            {/* Botón Eliminar */}
            {item.type === fineArtLineType && <Select id={'catalog-quantity-'+item.variantId}
              labelText={t('Cantidad','Quantity')} value={String(item.quantity)} disabled={loading}
              onChange={event=>setFineArtQuantity(item.variantId,Number(event.target.value))}>
              {Array.from({length:Math.max(10,item.quantity)},(_,index)=><SelectItem key={index} value={String(index+1)} text={String(index+1)} />)}
            </Select>}
            <button
              onClick={() => removeFromCart(item.id, item.type, item.variantId)}
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
        {mixed && <Select id="cart-payment-group" labelText={t('Artículos para este pago','Items for this payment')} value={paymentGroup}
          onChange={event=>{ setPaymentGroup(event.target.value);setError('') }} disabled={loading}>
          <SelectItem value="catalog" text={t('Presentaciones de Product Studio','Product Studio presentations')} />
          <SelectItem value="legacy" text={t('Otros artículos del carrito','Other cart items')} />
        </Select>}
        {!catalogCompatible && <p role="alert">{t('Paga las presentaciones de Product Studio por separado, con el destino y la moneda que seleccionaste.','Check out Product Studio presentations separately in the original destination and currency.')}</p>}
        {user && !hasFineArt && <WelcomePromoBadge />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--cds-text-secondary)', letterSpacing: '0.5px' }}>
            {t('SUBTOTAL', 'SUBTOTAL')}
          </span>
          <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>
            {cartTotal.text}
            {cartTotal.approximate && <ExchangeNote />}
          </span>
        </div>

        {!user && !checkoutItems.every(i => i.type === 'PRINT' && i.variantId && i.edition_type === 'OPEN') ? (
          <Button
            kind="tertiary"
            disabled={!shipping.compatible || !marketCompatible || !catalogCompatible}
            renderIcon={Login}
            onClick={handleCheckout}
            style={{ width: '100%', justifyContent: 'space-between' }}
          >
            {t('Inicia Sesión para Pagar', 'Sign In to Pay')}
          </Button>
        ) : (
          hasFineArt || checkoutItems.every(i => i.type === 'PRINT' && i.variantId && i.edition_type === 'OPEN')
          ? <Button onClick={handleCheckout} disabled={loading || !shipping.compatible || !marketCompatible || !catalogCompatible} style={{ width: '100%' }}>{t('Pagar reproducciones', 'Checkout prints')}</Button>
          : <PaymentDelivery items={checkoutItems} onOnline={handleCheckout} disabled={loading || !shipping.compatible || !marketCompatible || !catalogCompatible} onlineLabel={t('Proceder al pago','Proceed to payment')} />
        )}
      </div>

    </div>
  )
}