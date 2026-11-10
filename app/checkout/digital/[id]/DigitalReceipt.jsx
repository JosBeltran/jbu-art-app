'use client'

import { useEffect, useState } from 'react'
import { Button, Column, Grid, InlineLoading, InlineNotification } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'

export default function DigitalReceipt({ purchaseId }) {
  const { t } = useI18n()
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const endpoint = `/api/digital-downloads/${purchaseId}`

  useEffect(() => {
    const controller = new AbortController()
    let next
    async function load(tries) {
      try {
        const headers = await authHeaders()
        const res = await fetch(endpoint, { headers, signal: controller.signal, cache: 'no-store' })
        if (!res.ok) throw new Error('purchase_unavailable')
        const data = await res.json()
        if (controller.signal.aborted) return
        setReceipt(data)
        if (!data.paid && tries > 0) next = setTimeout(() => load(tries - 1), 3000)
      } catch {
        if (!controller.signal.aborted) setError(true)
      }
    }
    load(5)
    return () => {
      controller.abort()
      clearTimeout(next)
    }
  }, [attempt, endpoint])

  async function download() {
    setBusy(true)
    setError(false)
    try {
      const headers = await authHeaders()
      const response = await fetch(endpoint, { method: 'POST', headers })
      if (!response.ok) throw new Error('download_unavailable')
      const { url } = await response.json()
      const link = document.createElement('a')
      link.href = url
      link.referrerPolicy = 'no-referrer'
      link.download = ''
      document.body.appendChild(link)
      link.click()
      link.remove()
      setAttempt(current => current + 1)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Grid as="main">
      <Column sm={4} md={6} lg={8}>
        <h1>{t('Descarga digital', 'Digital download')}</h1>
        {error && <InlineNotification kind="error" hideCloseButton title={t(
          'No se pudo abrir la descarga. Conserva esta pestaña y vuelve a intentarlo.',
          'The download could not be opened. Keep this tab open and try again.',
        )} />}
        {!receipt && !error && <InlineLoading description={t('Consultando la compra…', 'Checking your purchase…')} />}
        {receipt && <p>{receipt.title} · {receipt.size}</p>}
        {receipt?.paid && (
          <>
            <p>{t('Descargas restantes', 'Downloads remaining')} {receipt.remaining}</p>
            <Button disabled={busy || receipt.remaining < 1} onClick={download}>
              {t('Descargar archivo', 'Download file')}
            </Button>
          </>
        )}
        {receipt && !receipt.paid && <p>{t('Esperando confirmación de Stripe.', 'Waiting for Stripe confirmation.')}</p>}
        {(error || (receipt && !receipt.paid)) && (
          <Button kind="ghost" onClick={() => { setError(false); setAttempt(current => current + 1) }}>
            {t('Volver a consultar', 'Check again')}
          </Button>
        )}
      </Column>
    </Grid>
  )
}
