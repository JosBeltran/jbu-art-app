'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { InlineLoading } from '@carbon/react'

export default function GuestOrderPage() {
  const { token } = useParams()
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    fetch('/api/guest-orders/' + encodeURIComponent(token), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('order_unavailable'); return r.json() })
      .then(v => { if (active) setData(v) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [token])
  return <main style={{ maxWidth: 760, padding: '3rem 1.5rem', margin: '0 auto', color: 'var(--cds-text-primary)' }}>
    <p style={{ letterSpacing: '.15em' }}>ESTUDIO JBU</p>
    <h1>{t('Seguimiento de reproducción', 'Print order tracking')}</h1>
    {!data && !error && <InlineLoading description={t('Consultando pedido…', 'Loading order…')} />}
    {error && <p role="alert">{t('Enlace inválido, revocado o no disponible.', 'Link invalid, revoked, or unavailable.')}</p>}
    {data && <>
      <p>{t('Pedido', 'Order')} #{data.order.id.slice(0, 8).toUpperCase()}</p>
      <p>{t('Estado', 'Status')}: {data.order.status} · {t('Producción', 'Production')}: {data.order.production_status}</p>
      <ul>{data.items.map((item, i) => <li key={i} style={{ padding: '1rem 0' }}>
        {item.print_image_url_snapshot && <img src={item.print_image_url_snapshot} alt={item.title_snapshot} width={96} height={96} style={{width:96,height:96,objectFit:'contain',marginBottom:'.5rem'}} onError={(e) => { e.currentTarget.style.display = 'none' }} />}
        <strong>{item.title_snapshot}</strong><br />
        {item.print_size_snapshot} · {item.print_finish_snapshot} · ×{item.quantity}
      </li>)}</ul>
      <p><strong>{t('Importe pagado', 'Amount paid')}:</strong> {data.order.charged_currency} {Number(data.order.charged_amount ?? data.order.total_amount_mxn).toFixed(2)}</p>
      {data.order.tracking_number && <p>{t('Rastreo', 'Tracking')}: {data.order.tracking_number}</p>}
      {data.order.tracking_url?.startsWith('https://') && <a href={data.order.tracking_url} target="_blank" rel="noopener noreferrer">{t('Seguir envío', 'Track shipment')}</a>}
    </>}
  </main>
}
