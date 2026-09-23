'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import ArtworkImage from '@/components/ArtworkImage'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { Button, InlineLoading, InlineNotification, ProgressIndicator, ProgressStep, Tag, Tile } from '@carbon/react'
import { ArrowLeft, ArrowUpRight, Certificate, Checkmark, DeliveryTruck, Package } from '@carbon/icons-react'
import styles from './OrderDetail.module.css'

const statusMap = (t) => ({
  PAYMENT_RECEIVED: { label: t('Pago confirmado', 'Payment confirmed'), type: 'purple' },
  PROCESSING: { label: t('En preparación', 'In preparation'), type: 'warm-gray' },
  SHIPPED: { label: t('En camino', 'Shipped'), type: 'blue' },
  DELIVERED: { label: t('Entregado', 'Delivered'), type: 'green' },
  CANCELLED: { label: t('Cancelado', 'Cancelled'), type: 'red' },
})

const money = (value) => `$${Number(value || 0).toLocaleString('es-MX')} MXN`
const progressIndex = (status) => ({ PAYMENT_RECEIVED: 0, PROCESSING: 1, SHIPPED: 2, DELIVERED: 3 }[status] ?? 0)

export default function OrderTrackingPage({ params }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const { id } = use(params)
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const fetchOrderDetails = async () => {
      setLoading(true)
      const { data: orderData, error: orderError } = await supabase.from('orders').select('*').eq('id', id).single()
      if (orderError || !orderData) {
        setErrorMsg(t('No se encontró la orden especificada. Verifica el número de pedido.', 'The specified order was not found. Check the order number.'))
        setLoading(false)
        return
      }
      setOrder(orderData)
      const { data: itemsData, error: itemsError } = await supabase.from('order_items').select(`*, claim_groups ( group_token ), artworks ( sku, primary_image_url)`).eq('order_id', id)
      if (itemsError) console.error('Error al obtener ítems:', itemsError)
      else if (itemsData) setItems(itemsData)
      setLoading(false)
    }
    if (id) fetchOrderDetails()
  }, [id, t])

  if (loading) return <div className={styles.loading}><InlineLoading description={t('Consultando información del pedido...', 'Fetching order information...')} /></div>
  if (errorMsg || !order) return <div className={styles.emptyState}><Tile className={styles.errorTile}><InlineNotification lowContrast kind="error" title={t('Pedido no disponible', 'Order not available')} subtitle={errorMsg} hideCloseButton /><Button className={styles.errorAction} as={Link} href="/collection" kind="tertiary" renderIcon={ArrowLeft}>{t('Volver a mi colección', 'Back to my collection')}</Button></Tile></div>

  const current = progressIndex(order.status)
  const status = statusMap(t)[order.status] || { label: order.status, type: 'gray' }
  const address = order.shipping_address || {}
  const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price_mxn || 0) * Number(item.quantity || 1), 0)

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><div><p className={styles.eyebrow}>{t('Pedido · Estudio JBU', 'Order · JBU Studio')}</p><h1 className={styles.title}>{t('Orden', 'Order')} #{order.id.slice(0, 8).toUpperCase()}</h1><p className={styles.meta}>{order.buyer_name} · {new Date(order.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div><Tag type={status.type} size="md">{status.label}</Tag></header>
    {order.status === 'CANCELLED' && <InlineNotification className={styles.cancelled} lowContrast kind="error" title={t('Pedido cancelado', 'Order cancelled')} subtitle={t('Esta orden ya no continuará con el proceso de envío.', 'This order will not continue with the shipping process.')} hideCloseButton />}
    <div className={styles.layout}>
      <div className={styles.main}>
        {order.status !== 'CANCELLED' && <section className={styles.section}><h2 className={styles.sectionTitle}><DeliveryTruck size={20} /> {t('Progreso del envío', 'Shipping progress')}</h2><div className={styles.progress}><ProgressIndicator currentIndex={current}><ProgressStep complete={current > 0} current={current === 0} label={t('Pago confirmado', 'Payment confirmed')} description={t('Orden recibida', 'Order received')}/><ProgressStep complete={current > 1} current={current === 1} label={t('Preparación', 'Preparation')} description={t('Empaque especial', 'Special packaging')}/><ProgressStep complete={current > 2} current={current === 2} label={t('En camino', 'Shipped')} description={t('Paquetería asignada', 'Carrier assigned')}/><ProgressStep complete={current > 3} current={current === 3} label={t('Entregado', 'Delivered')} description={t('Pedido completado', 'Order completed')}/></ProgressIndicator></div></section>}
        <section className={styles.section}><h2 className={styles.sectionTitle}><Package size={20} /> {t('Rastreo y logística', 'Tracking and logistics')}</h2>{order.tracking_number ? <><div className={styles.tracking}><div className={styles.datum}><span className={styles.label}>{t('Paquetería', 'Carrier')}</span><p className={styles.value}>{order.courier_name || t('Servicio de paquetería', 'Shipping service')}</p></div><div className={styles.datum}><span className={styles.label}>{t('Número de guía', 'Tracking number')}</span><p className={styles.value}>{order.tracking_number}</p></div></div>{order.tracking_url && <Button className={styles.trackButton} as="a" href={order.tracking_url} target="_blank" rel="noopener noreferrer" renderIcon={ArrowUpRight}>{t('Rastrear paquete', 'Track package')}</Button>}</> : <InlineNotification className={styles.notice} lowContrast kind="info" title={t('Preparando tu envío', 'Preparing your shipment')} subtitle={t('La guía aparecerá aquí cuando el taller termine el empaque y asigne la paquetería.', 'The tracking number will appear here once the studio finishes packaging and assigns the carrier.')} hideCloseButton />}</section>
        <section className={styles.section}><h2 className={styles.sectionTitle}><Certificate size={20} /> {t('Obras y certificados', 'Artworks and certificates')} ({items.length})</h2><div className={styles.items}>{items.map((item) => { const claimed = item.is_claimed || Boolean(item.claimed_at); const token = item.claim_groups?.group_token; const claimUrl = token ? `/claim/lote?token=${token}` : `/claim?sku=${encodeURIComponent(item.sku_snapshot)}&token=${encodeURIComponent(item.claim_token_snapshot || '')}`; return <article className={styles.item} key={item.id}><div className={styles.imageWrap}><ArtworkImage title={item.title_snapshot} primaryUrl={item.artworks?.primary_image_url} sku={item.artworks?.sku || item.sku_snapshot} className={styles.image}/></div><div className={styles.itemBody}><p className={styles.sku}>{item.sku_snapshot}</p><h3 className={styles.itemTitle}>{item.title_snapshot}</h3><p className={styles.price}>{money(item.unit_price_mxn)}</p></div><div className={styles.itemAction}>{claimed ? <Button as={Link} href="/collection" kind="tertiary" size="sm" renderIcon={Checkmark}>{t('Ver certificado', 'View certificate')}</Button> : <Button as={Link} href={claimUrl} kind="primary" size="sm" renderIcon={Certificate}>{t('Reclamar certificado', 'Claim certificate')}</Button>}</div></article>})}</div></section>
      </div>
      <aside className={styles.aside}><div className={styles.summary}><section className={styles.section}><h2 className={styles.sectionTitle}>{t('Resumen', 'Summary')}</h2><div className={styles.summaryRow}><span>{t('Obras', 'Artworks')}</span><strong>{items.length}</strong></div><div className={styles.summaryRow}><span>{t('Subtotal', 'Subtotal')}</span><strong>{money(subtotal)}</strong></div><div className={`${styles.summaryRow} ${styles.total}`}><span>{t('Total', 'Total')}</span><strong>{money(order.total_mxn || subtotal)}</strong></div></section><section className={styles.section}><h2 className={styles.sectionTitle}>{t('Dirección de entrega', 'Delivery address')}</h2><address className={styles.address}>{address.line1}{address.line2 && <><br/>{address.line2}</>}<br/>{address.city}, {address.state} {address.postal_code}<br/>{address.country}</address></section></div></aside>
    </div>
  </div></main>
}
