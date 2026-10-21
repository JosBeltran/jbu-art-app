'use client'

// Acción Compartir de la ficha pública de obra.
// Móvil: hoja nativa del dispositivo (navigator.share). Escritorio / sin soporte: panel editorial compacto.
// La analítica es ligera y nunca bloquea la acción de compartir.

import { useState } from 'react'
import { Button, Modal } from '@carbon/react'
import { Share, Launch, Copy, Checkmark } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { artworkUrl, shareMessage, whatsappUrl, pinterestUrl, facebookUrl, xUrl } from '@/lib/share'
import styles from './ArtworkShare.module.css'

export default function ArtworkShare({
  artworkId,
  sku,
  title,
  description = '',
  image = null,
  price = null,
  available = false,
  iconOnly = false,
  className = undefined
}) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const url = artworkUrl(sku)
  const shortDescription = String(description || '').slice(0, 160)

  const recordShare = (channel) => {
    try {
      supabase
        .rpc('record_artwork_share', { target_artwork_id: artworkId, share_channel: channel })
        .then(({ error }) => { if (error) console.warn('share analytics:', error.message) })
        .catch(() => {})
    } catch {
      /* compartir siempre debe funcionar */
    }
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: shareMessage({ title, price, available, locale }), url })
        recordShare('native')
        return
      } catch (err) {
        if (err && err.name === 'AbortError') return // el usuario canceló la hoja nativa
      }
    }
    setOpen(true)
  }

  const openChannel = (channel, target) => {
    recordShare(channel)
    window.open(target, '_blank', 'noopener,noreferrer')
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Respaldo para navegadores sin clipboard API
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    recordShare('copy_link')
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const channels = [
    { id: 'pinterest', label: 'Pinterest', href: () => pinterestUrl({ url, image, title, description: shortDescription }) },
    { id: 'whatsapp', label: 'WhatsApp', href: () => whatsappUrl({ title, url, price, available, locale }) },
    { id: 'facebook', label: 'Facebook', href: () => facebookUrl(url) },
    { id: 'x', label: 'X', href: () => xUrl({ url, title }) }
  ]

  return (
    <>
      {iconOnly ? (
        <Button
          hasIconOnly
          renderIcon={Share}
          iconDescription={t('Compartir obra', 'Share artwork')}
          tooltipPosition="bottom"
          kind="ghost"
          size="md"
          onClick={handleShare}
        />
      ) : (
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Share}
          onClick={handleShare}
          className={className}
        >
          {t('Compartir', 'Share')}
        </Button>
      )}

      <Modal
        open={open}
        modalHeading={t('Compartir esta obra', 'Share this artwork')}
        passiveModal
        onRequestClose={() => setOpen(false)}
        size="sm"
      >
        <p className={styles.shareTitle}>{title}</p>
        <div className={styles.shareList} role="list">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              role="listitem"
              className={styles.shareRow}
              onClick={() => openChannel(c.id, c.href())}
              aria-label={t(`Compartir en ${c.label}`, `Share on ${c.label}`)}
            >
              <span>{c.label}</span>
              <Launch size={16} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            role="listitem"
            className={styles.shareRow}
            onClick={copyLink}
            aria-live="polite"
          >
            <span>{copied ? t('Enlace copiado', 'Link copied') : t('Copiar enlace', 'Copy link')}</span>
            {copied ? <Checkmark size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </button>
        </div>
      </Modal>
    </>
  )
}
