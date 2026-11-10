'use client'

import { useEffect, useRef, useState } from 'react'
import { chargeFor, formatMoney } from '@/lib/currency'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button, InlineLoading } from '@carbon/react'
import { ArrowRight, CheckmarkOutline } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { authHeaders } from '@/lib/authHeaders'
import ArtworkImage from '@/components/ArtworkImage'
import { useCart } from '@/context/CartContext' // 👈 Ajusta si la ruta de tu CartContext difiere
import { useI18n } from '@/components/I18nProvider'
import styles from './Success.module.css'

const money = (value, locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(value) || 0)

// Pedidos cobrados en USD muestran lo realmente cobrado (misma tasa del pago).
const paid = (unitMxn, order, locale) => {
  const rate = Number(order?.fx_usd_per_mxn)
  if (order?.charged_currency === 'USD' && rate > 0) return formatMoney(chargeFor(unitMxn, 'USD', rate).cents / 100, 'USD', locale)
  return money(unitMxn, locale)
}

function SuccessContent() {
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : 'es-MX'
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const printCart = searchParams.get('print_cart') === '1'

  // Datos de solo lectura del pedido real creado por el webhook (no modifica nada).
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [lookup, setLookup] = useState('loading') // loading | found | pending

  // Consumir la función de vaciado o refresco del contexto si la tienes expuesta
  const cartContext = useCart()
  const clearCart = cartContext?.clearRegisteredCart || cartContext?.fetchCart

  const cleanedRef = useRef(false)

  useEffect(() => {
    if (!sessionId || printCart || cleanedRef.current) return
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
  }, [sessionId, printCart, clearCart])

  const clearedPrints = useRef(false)
  const { removeFromCart } = cartContext
  useEffect(() => {
    if (!printCart || lookup !== 'found' || clearedPrints.current || !cartContext.user) return
    clearedPrints.current = true
    for (const item of items) {
      if (item.print_variant_id) void removeFromCart(item.artwork_id, 'PRINT', item.print_variant_id)
    }
  }, [printCart, lookup, items, removeFromCart, cartContext.user])

  // Busca el pedido confirmado; el webhook puede tardar unos segundos.
  useEffect(() => {
    if (!sessionId) { setLookup('pending'); return }
    let cancelled = false
    const find = async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        try {
          const { data } = await supabase.from('orders').select('id').eq('stripe_session_id', sessionId).maybeSingle()
          if (data?.id) {
            const res = await fetch(`/api/orders/${data.id}`, { headers: await authHeaders(), cache: 'no-store' })
            if (res.ok) {
              const json = await res.json()
              if (!cancelled) { setOrder(json.order); setItems(json.items || []); setLookup('found') }
              return
            }
          }
        } catch (err) {
          console.error('No se pudo consultar el pedido confirmado:', err)
        }
        await new Promise((r) => setTimeout(r, 2500))
      }
      if (!cancelled) setLookup('pending')
    }
    find()
    return () => { cancelled = true }
  }, [sessionId])

  const orderNumber = order?.id ? order.id.slice(0, 8).toUpperCase() : null

  return (
    <article className={styles.wrap}>
      <p className={styles.eyebrow}>JBU · {t('Adquisición', 'Acquisition')}</p>
      <p className={styles.status}><CheckmarkOutline size={16} aria-hidden="true" /> {t('Pago confirmado', 'Payment confirmed')}</p>
      <h1 className={styles.title}>{t('Gracias por tu adquisición.', 'Thank you for your acquisition.')}</h1>
      {orderNumber && <p className={styles.orderNo}>{t('Orden', 'Order')} #{orderNumber}</p>}

      <p className={styles.lead}>
        {t(
          'Tu adquisición ha sido confirmada. Puedes seguir el estado del pedido y la entrega desde tu espacio de coleccionista.',
          'Your acquisition has been confirmed. You can follow the order and delivery status from your collector space.'
        )}
      </p>

      {lookup === 'loading' && (
        <div className={styles.loading}><InlineLoading description={t('Cargando el detalle del pedido…', 'Loading order details…')} /></div>
      )}

      {lookup === 'found' && items.length > 0 && (
        <ul className={styles.items}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.thumb}>
                <ArtworkImage title={item.title_snapshot} primaryUrl={item.print_image_url_snapshot || item.artworks?.primary_image_url} sku={item.artworks?.sku || item.sku_snapshot} className={styles.image} />
              </div>
              <div>
                <p className={styles.sku}>{item.sku_snapshot}</p>
                <h2 className={styles.itemTitle}>{item.title_snapshot}</h2>
                <p className={styles.artist}>Josué Beltrán Uresti</p>
                <p className={styles.price}>{paid(item.unit_price_mxn, order, locale)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lookup === 'found' && order && (
        <dl className={styles.summary}>
          <div><dt>{t('Estado', 'Status')}</dt><dd>{t('Pedido confirmado · Pago recibido', 'Order confirmed · Payment received')}</dd></div>
          <div><dt>{t('Total', 'Total')}</dt><dd>{order.charged_currency === 'USD' && Number.isFinite(Number(order.charged_amount)) ? formatMoney(order.charged_amount, 'USD', locale) : money(order.total_amount_mxn, locale)}</dd></div>
        </dl>
      )}

      {lookup === 'pending' && sessionId && (
        <p className={styles.note}>
          {t('Estamos terminando de registrar tu pedido. Aparecerá en tu colección en unos momentos.', 'We are finishing recording your order. It will appear in your collection shortly.')}
          <span className={styles.ref}>{t('Referencia', 'Reference')}: {sessionId}</span>
        </p>
      )}

      <p className={styles.note}>
        {t(
          'Tu Certificado Digital de Autenticidad estará disponible desde tu espacio de coleccionista una vez emitido.',
          'Your Certificate of Authenticity will be available from your collector space once issued.'
        )}
      </p>

      <div className={styles.actions}>
        {order?.id && (
          <Button as={Link} href={`/orders/${order.id}`} kind="primary" renderIcon={ArrowRight} className={styles.cta}>
            {t('Ver pedido', 'View order')}
          </Button>
        )}
        <Button as={Link} href="/collection" kind={order?.id ? 'tertiary' : 'primary'} className={styles.cta}>
          {t('Ir a mi colección', 'Go to my collection')}
        </Button>
        <Link href="/catalog" className={styles.explore}>{t('Seguir explorando', 'Continue exploring')}</Link>
      </div>
    </article>
  )
}

function GuestPrintSuccess() {
  const { t } = useI18n()
  const params = useSearchParams()
  const session = params.get('session_id')
  const [result, setResult] = useState({ status: 'loading' })
  const [retry, setRetry] = useState(0)
  // Retrieve a one-time return fragment provided by Stripe and remove it from
  // the address bar immediately so it is not saved in browsing history.
  useEffect(() => {
    if (!session || typeof window === 'undefined') return
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const token = fragment.get('jbu_access')
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return
    try { window.sessionStorage.setItem('jbu_open_print_access:' + session, token) } catch {}
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    setRetry(n => n + 1)
  }, [session])
  const { clearGuestPrintCart } = useCart()
  const cleared = useRef(false)

  useEffect(() => {
    if (!session) { setResult({ status: 'invalid' }); return }
    let cancelled = false
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    const checkStatus = async () => {
      setResult({ status: 'loading' })
      // Do not assume the Stripe redirect and the local browser have the same
      // origin or tab. A missing token must NEVER hide a verified paid order.
      for (let i = 0; i < 8 && !cancelled; i++) {
        try {
          let secret = ''
          try { secret = window.sessionStorage.getItem('jbu_open_print_access:' + session) || '' } catch {}
          const response = await fetch('/api/checkout/open-edition/status?session_id=' + encodeURIComponent(session), {
            cache: 'no-store',
            headers: secret ? { 'x-jbu-guest-token': secret } : {},
          })
          const data = await response.json()
          if (cancelled) return
          if (!response.ok && data.status !== 'unavailable') {
            setResult({ status: 'unavailable' })
            return
          }
          setResult(data)
          if (data.status === 'paid') return
          if (!['pending', 'processing'].includes(data.status)) return
        } catch {
          if (!cancelled) setResult({ status: 'unavailable' })
          return
        }
        if (i < 7) await wait(2500)
      }
    }
    checkStatus()
    return () => { cancelled = true }
  }, [session, retry])

  useEffect(() => {
    if (result.status !== 'paid' || cleared.current) return
    cleared.current = true
    clearGuestPrintCart?.()
  }, [result.status, clearGuestPrintCart])

  const paid = result.status === 'paid'
  const pending = result.status === 'loading' || result.status === 'processing' || result.status === 'pending'
  return <article className={styles.wrap}>
    <p className={styles.eyebrow}>JBU · OPEN EDITION PRINT</p>
    {paid ? <>
      <p className={styles.status}><CheckmarkOutline size={16} aria-hidden="true" /> {t('Pago confirmado', 'Payment confirmed')}</p>
      <h1 className={styles.title}>{t('Gracias por tu compra.', 'Thank you for your purchase.')}</h1>
      <p className={styles.lead}>{t(
        'El pago y el registro de tu pedido están confirmados.',
        'Your payment and order registration are confirmed.'
      )}</p>
      {result.order_reference && (
        <p className={styles.note}><strong>{t('Referencia del pedido', 'Order reference')}: {result.order_reference}</strong></p>
      )}
      <p className={styles.note}>{result.confirmation_email_status === 'sent'
        ? t('Enviamos el comprobante y el enlace privado al correo utilizado en Stripe.', 'We sent your receipt and private order link to the email used at Stripe.')
        : t('El envío del correo de confirmación todavía no está confirmado. Conserva esta referencia y tu comprobante de Stripe.', 'Confirmation email delivery is not yet confirmed. Keep this reference and your Stripe receipt.')
      }</p>
      {result.order_url ? (
        <Button as={Link} href={result.order_url} kind="primary">{t('Consultar pedido', 'View order')}</Button>
      ) : (
        <p className={styles.note}>{t(
          'No está disponible el enlace privado en esta pestaña. Comunícate con el estudio e indica la referencia del pedido para recuperar tu acceso. No vuelvas a pagar.',
          'Your private order link is unavailable in this browser tab. Contact the studio with your order reference to recover access. Do not pay again.'
        )}</p>
      )}
      {result.order_reference && (
        <Button kind="tertiary" onClick={() => window.print()}>{t('Guardar o imprimir comprobante', 'Save or print receipt')}</Button>
      )}
    </> : <>
      <h1 className={styles.title}>{pending ? t('Verificando tu pago', 'Verifying your payment') : t('No pudimos verificar tu pedido', 'Unable to verify your order')}</h1>
      <p className={styles.lead}>{pending
        ? t('Estamos consultando el estado del pedido.', 'We are checking your order status.')
        : t('No pudimos completar la consulta de estado. Esto no significa que el pago haya fallado. No vuelvas a pagar.', 'The status lookup could not complete. This does not mean your payment failed. Do not pay again.')
      }</p>
      <Button kind="secondary" onClick={() => setRetry(n => n + 1)}>
        {t('Volver a verificar', 'Check again')}
      </Button>
    </>}
    <Link href="/catalog">{t('Seguir explorando', 'Continue exploring')}</Link>
  </article>
}

function SuccessRouter() {
  const params = useSearchParams()
  return params.get('guest_print') === '1' ? <GuestPrintSuccess /> : <SuccessContent />
}

export default function SuccessPage() {
  const { t } = useI18n()
  return (
    <main className={styles.page}>
      <Suspense fallback={<InlineLoading description={t('Cargando confirmación...', 'Loading confirmation...')} />}>
        <SuccessRouter />
      </Suspense>
    </main>
  )
}
