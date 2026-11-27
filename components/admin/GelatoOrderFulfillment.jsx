'use client'

import { useState } from 'react'
import { Button, InlineNotification, Select, SelectItem, Tag } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'

export default function GelatoOrderFulfillment({ job, preparation, refresh }) {
  const { t } = useI18n()
  const [quote, setQuote] = useState(null)
  const [method, setMethod] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const snapshot = preparation.snapshot
  const shipment = quote?.methods.find(option => option.method === method)
  const subtotal = shipment ? quote.manufacturingMinor + shipment.shippingMinor : null
  const total = subtotal == null || quote.taxMinor == null ? null : subtotal + quote.taxMinor
  const money = (amount, currency = quote?.currency) => amount == null
    ? t('No disponible', 'Unavailable') : new Intl.NumberFormat(undefined, { style:'currency', currency }).format(amount / 100)
  const ready = preparation.state === 'READY' && ['pending_review', 'approved'].includes(job.state)
  const status = {
    pending_review:t('Pendiente de cotización y autorización', 'Awaiting quote and approval'),
    approved:t('Autorizado', 'Approved'),
    submitting:t('Enviando a Gelato', 'Submitting to Gelato'),
    submitted:t('Enviado a Gelato', 'Sent to Gelato'),
    reconciliation_required:t('Revisa la referencia en Gelato antes de volver a enviar', 'Check the reference in Gelato before resubmitting'),
  }[job.state]

  async function run(operation, input = {}) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/admin/product-catalog', {
        method:'POST', headers:{ ...await authHeaders(), 'Content-Type':'application/json' },
        body:JSON.stringify({ operation, input:{ jobId:job.id, ...input } }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (operation === 'quoteFulfillment') {
        setQuote(result)
        setMethod(result.methods[0]?.method || '')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      try { await refresh() } catch { setError('production_unavailable') }
      setBusy(false)
    }
  }

  return <section className="grid gap-2">
    <h4>Gelato</h4>
    <div><Tag>{status}</Tag> {job.provider_status && <Tag>{job.provider_status}</Tag>}</div>
    <p>{snapshot.widthMm} × {snapshot.heightMm} mm · {snapshot.orientation} · {snapshot.fit}</p>
    {snapshot.border && <p>{t('Borde contratado', 'Purchased border')} · {snapshot.border.value}{snapshot.border.unit === 'percent' ? '%' : ' mm'}</p>}
    <p>{(snapshot.attributes || []).filter(attribute => attribute.code !== 'jbu_border').map(attribute => attribute.value).join(' · ')}</p>
    {job.provider_order_id && <p>{t('Orden de Gelato', 'Gelato order')} · {job.provider_order_id}</p>}
    {['submitting','reconciliation_required'].includes(job.state) && <p>{t('Referencia JBU para conciliación', 'JBU reconciliation reference')} · {job.id}</p>}
    {error && <InlineNotification kind="error" title={t('No se pudo completar la operación', 'Could not complete the operation')} subtitle={error} />}
    {ready && <Button size="sm" kind="secondary" disabled={busy} onClick={() => void run('quoteFulfillment')}>
      {t('Cotizar en Gelato', 'Get Gelato quote')}
    </Button>}
    {ready && quote && <>
      <Select id={'gelato-shipping-' + job.id} labelText={t('Método de envío', 'Shipping method')} value={method}
        onChange={event => setMethod(event.target.value)} disabled={busy}>
        {quote.methods.map(option => <SelectItem key={option.method} value={option.method} text={option.carrier || option.method} />)}
      </Select>
      <p>{t('Fabricación', 'Manufacturing')} · {money(quote.manufacturingMinor)}</p>
      <p>{t('Envío', 'Shipping')} · {money(shipment?.shippingMinor)}</p>
      <p>{t('Impuestos del proveedor', 'Provider tax')} · {money(quote.taxMinor)}</p>
      <p>{t('Subtotal del proveedor', 'Provider subtotal')} · {money(subtotal)}</p>
      <p>{t('Total del proveedor', 'Provider total')} · {money(total)}</p>
      <p>{t('Importe cobrado por este artículo', 'Customer payment for this item')} · {money(quote.customerPaymentMinor, quote.chargedCurrency)}</p>
      {total != null && quote.currency === quote.chargedCurrency && quote.customerPaymentMinor != null &&
        <p>{t('Margen estimado', 'Estimated margin')} · {money(quote.customerPaymentMinor - total)}</p>}
      <Button size="sm" disabled={busy || !method} onClick={() => void run('approveFulfillment', {
        quoteId:quote.id, shippingMethod:method, confirm:true,
      })}>{t('Autorizar esta cotización', 'Approve this quote')}</Button>
    </>}
    {ready && job.state === 'approved' && <Button size="sm" disabled={busy || !job.canSubmit}
      onClick={() => void run('submitFulfillment', { confirm:true })}>{t('Enviar a producción en Gelato', 'Submit to Gelato production')}</Button>}
    {ready && job.state === 'approved' && !job.canSubmit &&
      <p>{t('El envío requiere un pago real de Stripe y el envío a proveedor habilitado.', 'Submission requires a live Stripe payment and enabled provider submission.')}</p>}
    {job.state === 'submitted' && <Button kind="secondary" size="sm" disabled={busy}
      onClick={() => void run('syncFulfillment')}>{t('Actualizar estado y rastreo', 'Refresh status and tracking')}</Button>}
    {job.shipments?.length > 0 && <ul>{job.shipments.map((parcel, index) => <li key={parcel.id || index}>
      {parcel.carrier} · {parcel.trackingUrl ? <a href={parcel.trackingUrl} target="_blank" rel="noopener noreferrer">{parcel.trackingCode}</a> : parcel.trackingCode}
    </li>)}</ul>}
  </section>
}
