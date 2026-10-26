'use client'

import { useState } from 'react'
import { Button, InlineNotification } from '@carbon/react'
import { LogoWhatsapp, Email } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import {
  resolveInquiryChannel,
  whatsappInquiryUrl,
  inquiryArtworkUrl,
} from '@/lib/inquiry'

/**
 * «Consultar precio» / «Ask for price».
 *
 * El canal lo decide la configuración del sitio (site_settings):
 *  - WHATSAPP: abre wa.me con mensaje precargado (título, SKU, URL; sin precio).
 *  - EMAIL / INTERNAL: registra la consulta en el servidor (/api/inquiries),
 *    que valida la obra y notifica con la infraestructura existente.
 *
 * @param {{ artwork: any, settings?: object|null, size?: string, kind?: string, className?: string }} props
 */
export default function AskForPriceButton({ artwork, settings = null, size = 'md', kind = 'primary', className }) {
  const { t, locale } = useI18n()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const channel = resolveInquiryChannel(settings)
  const url = inquiryArtworkUrl(artwork?.sku)

  if (channel === 'WHATSAPP') {
    const href = whatsappInquiryUrl({
      title: artwork?.title,
      sku: artwork?.sku,
      url,
      locale,
      settings,
    })
    return (
      <Button
        as="a"
        href={href}
        target="_blank"
        rel="noreferrer"
        kind={kind}
        size={size}
        className={className}
        renderIcon={LogoWhatsapp}
      >
        {t('Consultar precio', 'Ask for price')}
      </Button>
    )
  }

  const sendInquiry = async () => {
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          artworkId: artwork?.id,
          sku: artwork?.sku,
          locale,
          channel,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || t('No se pudo enviar la consulta.', 'Could not send the inquiry.'))
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('No se pudo enviar la consulta.', 'Could not send the inquiry.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        kind={kind}
        size={size}
        renderIcon={Email}
        disabled={sending || sent}
        onClick={sendInquiry}
      >
        {sent
          ? t('Consulta enviada', 'Inquiry sent')
          : sending
            ? t('Enviando…', 'Sending…')
            : t('Consultar precio', 'Ask for price')}
      </Button>
      {error && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={t('Consulta de precio', 'Price inquiry')}
          subtitle={error}
        />
      )}
    </div>
  )
}
