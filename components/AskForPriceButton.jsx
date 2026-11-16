'use client'

import { useState } from 'react'
import { Button, InlineNotification, TextInput } from '@carbon/react'
import { Chat, Email } from '@carbon/icons-react'
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
 * @param {{ artwork: any, settings?: object|null, size?: string, kind?: string, className?: string, inquiryType?: string, printVariantId?: string|null }} props
 */
export default function AskForPriceButton({
  artwork,
  settings = null,
  size = 'md',
  kind = 'primary',
  className,
  inquiryType = 'price',
  printVariantId = null,
}) {
  const { t, locale } = useI18n()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [replyEmail, setReplyEmail] = useState('')

  const localInquiry = inquiryType === 'local_delivery'
  const inquiryLabel = localInquiry
    ? t('Consultar entrega local', 'Explore local delivery')
    : inquiryType === 'shipping'
      ? t('Solicitar cotización de envío', 'Request shipping quote')
      : t('Consultar precio', 'Ask for price')
  const channel = resolveInquiryChannel(settings)
  const url = inquiryArtworkUrl(artwork?.sku)

  if (channel === 'WHATSAPP') {
    const href = whatsappInquiryUrl({
      title:
        (localInquiry
          ? t('Entrega local: ', 'Local delivery: ')
          : inquiryType === 'shipping'
            ? t('Cotización de envío: ', 'Shipping quote: ')
            : '') + artwork?.title,
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
        renderIcon={Chat}
      >
        {inquiryLabel}
      </Button>
    )
  }

  const sendInquiry = async () => {
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeaders()),
        },
        body: JSON.stringify({
          artworkId: artwork?.id,
          sku: artwork?.sku,
          locale,
          channel,
          inquiryType,
          printVariantId,
          email: replyEmail,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(
          data.error ||
            t('No se pudo enviar la consulta.', 'Could not send the inquiry.')
        )
      setSent(true)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('No se pudo enviar la consulta.', 'Could not send the inquiry.')
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={className}>
      {inquiryType !== 'price' && (
        <TextInput
          id={`shipping-quote-email-${printVariantId || artwork.id}`}
          type="email"
          labelText={t(
            'Correo de contacto (para invitados)',
            'Contact email (for guests)'
          )}
          value={replyEmail}
          onChange={(e) => setReplyEmail(e.target.value)}
        />
      )}
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
            : inquiryLabel}
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
