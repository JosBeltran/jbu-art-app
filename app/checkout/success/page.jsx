'use client'

import { useEffect, useRef, useState } from 'react'
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

function SuccessContent() {
  const { t, lang } = useI18n()
  const locale = lang === 'en' ? 'en-US' : 'es-MX'
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  // Datos de solo lectura del pedido real creado por el webhook (no modifica nada).
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [lookup, setLookup] = useState('loading') // loading | found | pending

  // Consumir la función de vaciado o refresco del contexto si la tienes expuesta
  const cartContext = useCart()
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
                <ArtworkImage title={item.title_snapshot} primaryUrl={item.artworks?.primary_image_url} sku={item.artworks?.sku || item.sku_snapshot} className={styles.image} />
              </div>
              <div>
                <p className={styles.sku}>{item.sku_snapshot}</p>
                <h2 className={styles.itemTitle}>{item.title_snapshot}</h2>
                <p className={styles.artist}>Josué Beltrán Uresti</p>
                <p className={styles.price}>{money(item.unit_price_mxn, locale)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lookup === 'found' && order && (
        <dl className={styles.summary}>
          <div><dt>{t('Estado', 'Status')}</dt><dd>{t('Pedido confirmado · Pago recibido', 'Order confirmed · Payment received')}</dd></div>
          <div><dt>{t('Total', 'Total')}</dt><dd>{money(order.total_amount_mxn, locale)}</dd></div>
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

export default function SuccessPage() {
  const { t } = useI18n()
  return (
    <main className={styles.page}>
      <Suspense fallback={<InlineLoading description={t('Cargando confirmación...', 'Loading confirmation...')} />}>
        <SuccessContent />
      </Suspense>
    </main>
  )
}
