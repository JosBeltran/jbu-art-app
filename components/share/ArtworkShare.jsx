'use client'

import { useState } from 'react'
import { Button, Modal, InlineNotification } from '@carbon/react'
import { Share, Launch, Copy, Checkmark, Download } from '@carbon/icons-react'
import { allowsAnalytics } from '@/lib/cookieConsent'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { artworkUrl, shareMessage, whatsappUrl, pinterestUrl, facebookUrl, xUrl, linkedinUrl, SHARE_CHANNELS } from '@/lib/share'
import { socialConfig, socialImageUrl } from '@/lib/social/config'
import styles from './ArtworkShare.module.css'

/** @param {{artworkId:string, sku:string, title:string, description?:string, image?:string|null, price?:number|null, available?:boolean, iconOnly?:boolean, className?:string, social?:any}} props */
export default function ArtworkShare({ artworkId, sku, title, iconOnly = false, className = '', social = null }) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [asset, setAsset] = useState(null)
  const [notice, setNotice] = useState(null)
  const config = socialConfig(social?.config)
  const artist = social?.presentation?.artist || config.displayName
  const shareTitle = (String(locale).startsWith('en') && social?.titleEn) || title || social?.presentation?.title || sku
  const url = artworkUrl(sku)
  const imageUrl = (format) => socialImageUrl(sku, format, locale, social?.version)
  const recordShare = (channel) => {
    if (!allowsAnalytics() || !SHARE_CHANNELS.includes(channel)) return
    try { supabase.rpc('record_artwork_share', { target_artwork_id: artworkId, share_channel: channel }).then(() => {}, () => {}) } catch { /* nonblocking */ }
  }
  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
      else {
        const input = document.createElement('input'); input.value = url; document.body.appendChild(input); input.select()
        const success = document.execCommand('copy'); input.remove()
        if (!success) throw new Error('copy_failed')
      }
      recordShare('copy_link'); setCopied(true); window.setTimeout(() => setCopied(false), 2000)
    } catch { setNotice(t('No se pudo copiar el enlace.', 'Could not copy the link.')) }
  }
  const nativeShare = async () => {
    try {
      await navigator.share({ title: shareTitle, text: shareMessage({ title: shareTitle, artist, locale }), url })
      recordShare('native')
    } catch (error) { if (error?.name !== 'AbortError') setNotice(t('No se pudo abrir el menú del dispositivo. Usa otra opción.', 'Could not open device sharing. Use another option.')) }
  }
  const prepareInstagram = async () => {
    setBusy(true); setNotice(null)
    try {
      const response = await fetch(new URL(imageUrl('instagram')).pathname + new URL(imageUrl('instagram')).search)
      if (!response.ok) throw new Error('image_failed')
      const file = new File([await response.blob()], `${sku}-instagram.jpg`, { type: 'image/jpeg' })
      setAsset(file)
    } catch { setNotice(t('No se pudo preparar la imagen. Inténtalo de nuevo.', 'Could not prepare the image. Try again.')) }
    finally { setBusy(false) }
  }
  const shareInstagramFile = async () => {
    if (!asset) return
    try {
      await navigator.share({ files: [asset], title: shareTitle, text: shareMessage({ title: shareTitle, artist, locale }) })
    } catch (error) { if (error?.name !== 'AbortError') setNotice(t('Descarga la imagen para publicarla en Instagram.', 'Download the image to post it on Instagram.')) }
  }
  const downloadInstagram = () => {
    if (!asset) return
    const objectUrl = URL.createObjectURL(asset)
    const link = document.createElement('a'); link.href = objectUrl; link.download = asset.name
    document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
  }
  const channels = [
    { id: 'facebook', label: 'Facebook', href: facebookUrl(url) },
    { id: 'whatsapp', label: 'WhatsApp', href: whatsappUrl({ title: shareTitle, url, artist, locale }) },
    ...(config.pinterest.enabled ? [{ id: 'pinterest', label: 'Pinterest', href: pinterestUrl({ url, image: imageUrl('pinterest'), title: shareTitle, description: artist }) }] : []),
    { id: 'linkedin', label: 'LinkedIn', href: linkedinUrl(url) },
    { id: 'x', label: 'X', href: xUrl({ url, title: shareMessage({ title: shareTitle, artist }) }) },
  ]
  const start = () => { setNotice(null); setAsset(null); setOpen(true) }
  let canShareFile = false
  try { canShareFile = Boolean(asset && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [asset] })) } catch { /* download remains available */ }
  return <>
    {iconOnly ? <Button hasIconOnly renderIcon={Share} iconDescription={t('Compartir obra', 'Share artwork')} tooltipPosition="bottom" kind="ghost" size="md" onClick={start} /> : <Button kind="ghost" size="sm" renderIcon={Share} onClick={start} className={className}>{t('Compartir', 'Share')}</Button>}
    <Modal className={styles.shareModal} open={open} modalHeading={t('Compartir obra', 'Share artwork')} passiveModal onRequestClose={() => setOpen(false)} size="sm">
      <p className={styles.shareTitle}>{shareTitle}</p>
      <div className={styles.shareList}>
        {channels.map(channel => <Button key={channel.id} kind="ghost" renderIcon={Launch} className={styles.shareRow} href={channel.href} target="_blank" rel="noopener noreferrer" onClick={() => recordShare(channel.id)}>{channel.label}</Button>)}
        {config.instagram.enabled && <Button kind="ghost" renderIcon={Launch} className={styles.shareRow} disabled={busy} onClick={prepareInstagram}>{busy ? t('Preparando imagen…', 'Preparing image…') : 'Instagram'}</Button>}
        <Button kind="ghost" renderIcon={copied ? Checkmark : Copy} className={styles.shareRow} onClick={copyLink} aria-live="polite">{copied ? t('Enlace copiado', 'Link copied') : t('Copiar enlace', 'Copy link')}</Button>
        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && <Button kind="ghost" renderIcon={Share} className={styles.shareRow} onClick={nativeShare}>{t('Compartir con el dispositivo', 'Share with device')}</Button>}
      </div>
      {asset && <div className={styles.instagramActions}>
        <p>{t('La imagen está lista. Puedes guardarla y publicarla desde Instagram; el navegador no publica directamente.', 'Your image is ready. Save it and post from Instagram; the browser does not publish directly.')}</p>
        {canShareFile && <Button kind="tertiary" renderIcon={Share} onClick={shareInstagramFile}>{t('Compartir imagen', 'Share image')}</Button>}
        <Button kind="tertiary" renderIcon={Download} onClick={downloadInstagram}>{t('Descargar imagen', 'Download image')}</Button>
      </div>}
      {notice && <InlineNotification kind="warning" lowContrast hideCloseButton title={t('Compartir', 'Share')} subtitle={notice} />}
    </Modal>
  </>
}
