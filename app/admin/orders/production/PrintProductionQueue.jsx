'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, InlineLoading, InlineNotification, Pagination, Tag, Tile } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import PrintProductionPanel, { printProductionLabel, requestProduction } from '@/components/admin/PrintProductionPanel'

export default function PrintProductionQueue({ order, item }) {
  const { t } = useI18n()
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (item) return
    const controller = new AbortController()
    requestProduction('?page=' + page + (order ? '&order=' + encodeURIComponent(order) : ''), undefined, controller.signal)
      .then(setData)
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [order, item, page])

  return <main className="mx-auto grid max-w-4xl gap-4 px-4 py-8">
    <h1>{t('Preparación de Fine Art Prints', 'Fine Art Print Preparation')}</h1>
    <div><Button as={Link} href="/admin/orders" kind="ghost" size="sm">{t('Volver a órdenes', 'Back to orders')}</Button></div>
    {item ? <PrintProductionPanel item={item} /> : error ?
      <InlineNotification kind="error" title={t('No se pudo cargar la cola.', 'Could not load the queue.')} /> :
      !data ? <InlineLoading /> : !data.queue.length ?
        <p>{t('No hay prints pendientes de preparación en esta vista.', 'No prints awaiting preparation in this view.')}</p> :
        <ul className="grid gap-3">{data.queue.map(row => <li key={row.item_id}>
          <Tile className="grid gap-2">
            <h2>{row.snapshot.title} · {row.snapshot.size}</h2>
            <p>{t('Pedido', 'Order')} {row.order_id.slice(0, 8)} · {row.snapshot.quantity} × {row.snapshot.sku}</p>
            <div><Tag type={row.state === 'READY' ? 'green' : 'purple'}>{printProductionLabel(row.state, t)}</Tag></div>
            <div><Button as={Link} kind="secondary" size="sm" href={'/admin/orders/production?item=' + row.item_id}>
              {row.state === 'READY' ? t('Ver archivo de producción', 'View production file') : t('Preparar archivo de producción', 'Prepare production file')}
            </Button></div>
          </Tile>
        </li>)}</ul>}
    {!item && data?.count > data?.pageSize && <Pagination page={page} pageSize={data.pageSize} pageSizes={[data.pageSize]}
      totalItems={data.count} onChange={event => setPage(event.page)} itemsPerPageText={t('Por página', 'Per page')} />}
  </main>
}
