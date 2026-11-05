'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, InlineNotification } from '@carbon/react'
import { Certificate } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'

// Issuance is buyer-only, paid-and-delivered, server-side and idempotent.
export default function PhysicalEditionClaimButton({ orderItemId, isDelivered }) {
  const { t } = useI18n()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function claim() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/certificates/physical-edition/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ orderItemId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'certificate_unavailable')
      router.push(`/verify/${encodeURIComponent(data.sku)}`)
    } catch (err) {
      setError(err?.message || 'certificate_unavailable')
    } finally {
      setLoading(false)
    }
  }

  if (!isDelivered) {
    return <p>{t('Certificado disponible después de la entrega.',
      'Certificate available after delivery.')}</p>
  }
  return (
    <div>
      <Button size="sm" kind="primary" renderIcon={Certificate} disabled={loading} onClick={claim}>
        {loading ? t('Generando…', 'Issuing…') : t('Obtener certificado numerado', 'Get numbered certificate')}
      </Button>
      {error && <InlineNotification lowContrast kind="error" hideCloseButton
        title={t('No se pudo emitir el certificado', 'Could not issue certificate')}
        subtitle={error}/>}
    </div>
  )
}
