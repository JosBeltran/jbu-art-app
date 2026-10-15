'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import OptimizedImg from '@/components/media/OptimizedImg'
import Countdown from '@/components/auction/Countdown'
import { clockOffset, formatMXN } from '@/lib/auctions'
import styles from './ComoFunciona.module.css'

/** Marco sutil de dispositivo; la interfaz real es la protagonista. */
export function DeviceFrame({ children, caption }) {
  return (
    <figure className={styles.device}>
      <div className={styles.deviceScreen}>{children}</div>
      {caption && <figcaption className={styles.deviceCaption}>{caption}</figcaption>}
    </figure>
  )
}

/** Captura real de la interfaz JBU en móvil. */
export function ScreenshotScreen({ src, alt, caption, priority }) {
  const [failed, setFailed] = useState(false)
  return (
    <DeviceFrame caption={caption}>
      {!failed ? (
        <Image src={src} alt={alt} width={975} height={1950} sizes="(min-width: 1056px) 26rem, 92vw" priority={priority} className={styles.screenImg} onError={() => setFailed(true)} />
      ) : (
        <span className={styles.placeholder} role="img" aria-label={alt} />
      )}
    </DeviceFrame>
  )
}

/** Lote de subasta renderizado con datos reales; sin datos, una vista ilustrativa sin cifras. */
export function AuctionScreen() {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const [state, setState] = useState(null)

  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => { if (alive) setState((cur) => cur || { empty: true }) }, 8000)
    ;(async () => {
      try {
        const { data: rows } = await supabase.from('auctions_public').select('*').in('status', ['LIVE', 'UPCOMING']).order('status', { ascending: true }).order('ends_at', { ascending: true }).limit(4)
        const auction = (rows || []).find((r) => r.status === 'LIVE') || rows?.[0]
        if (!auction) { if (alive) setState({ empty: true }); return }
        const { data: art } = await supabase.from('artworks').select('*').eq('id', auction.artwork_id).maybeSingle()
        if (alive) setState(art ? { auction, art } : { empty: true })
      } catch {
        if (alive) setState({ empty: true })
      }
    })()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  if (!state) return <DeviceFrame><div className={styles.uiLoading} aria-hidden /></DeviceFrame>

  if (state.empty) {
    return (
      <DeviceFrame caption={t('Vista ilustrativa de un lote', 'Illustrative lot view')}>
        <div className={styles.ui}>
          <p className={styles.uiKicker}>{t('Lote', 'Lot')} · {t('Subasta en vivo', 'Live auction')}</p>
          <div className={styles.uiArt} />
          <p className={styles.uiLabel}>{t('Puja actual', 'Current bid')}</p>
          <p className={styles.uiMuted}>{t('Se muestra en tiempo real', 'Shown in real time')}</p>
          <span className={styles.uiPrimary}>{t('Pujar', 'Place bid')}</span>
          <span className={styles.uiSecondary}>{t('Comprar ya', 'Buy now')}</span>
        </div>
      </DeviceFrame>
    )
  }

  const { auction, art } = state
  const live = auction.status === 'LIVE'
  const offset = clockOffset(auction)
  const amount = live ? auction.current_bid ?? auction.starting_bid : auction.starting_bid

  return (
    <DeviceFrame caption={t('Datos reales de la plataforma', 'Live platform data')}>
      <Link href={`/artwork/${art.sku}`} className={styles.ui}>
        <p className={styles.uiKicker}>
          {auction.lot_number ? `${t('Lote', 'Lot')} ${String(auction.lot_number).padStart(2, '0')} · ` : ''}
          {live ? <><span className={styles.uiLive} aria-hidden />{t('En vivo', 'Live')}</> : t('Próxima subasta', 'Upcoming auction')}
        </p>
        <div className={styles.uiArt}>
          {art.primary_image_url && <OptimizedImg src={art.primary_image_url} alt={L(art, 'title')} variant="medium" sizes="26rem" className={styles.uiArtImg} />}
        </div>
        <h4 className={styles.uiTitle}>{L(art, 'title')}</h4>
        <div className={styles.uiRow}>
          <div>
            <p className={styles.uiLabel}>{live && auction.current_bid ? t('Puja actual', 'Current bid') : t('Puja inicial', 'Starting bid')}</p>
            <p className={styles.uiAmount}>{formatMXN(amount, locale)}</p>
          </div>
          <div className={styles.uiRight}>
            <p className={styles.uiLabel}>{live ? t('Termina en', 'Ends in') : t('Abre en', 'Opens in')}</p>
            <Countdown target={live ? auction.ends_at : auction.starts_at} offset={offset} compact />
          </div>
        </div>
        <span className={styles.uiPrimary}>{live ? t('Pujar', 'Place bid') : t('Seguir subasta', 'Follow auction')}</span>
        {auction.buy_now_price && <span className={styles.uiSecondary}>{t('Comprar ya', 'Buy now')}</span>}
      </Link>
    </DeviceFrame>
  )
}

/** Composición del Espacio del coleccionista con sus secciones existentes; sin cifras inventadas. */
export function CollectorScreen() {
  const { t } = useI18n()
  const tabs = [t('Siguiendo', 'Watching'), t('Pujando', 'Bidding'), t('Ganadas', 'Won')]
  const rows = [
    [t('Mi colección', 'My collection'), t('Obras adquiridas y certificados', 'Acquired works and certificates')],
    [t('Pedidos', 'Purchases'), t('Estado de compra y envío', 'Order and delivery status')],
    [t('Mis ofertas', 'My offers'), t('Propuestas enviadas y respuestas', 'Sent proposals and replies')],
  ]
  return (
    <DeviceFrame caption={t('Vista ilustrativa de tu espacio', 'Illustrative view of your space')}>
      <div className={styles.ui}>
        <p className={styles.uiKicker}>{t('Mi espacio', 'My space')}</p>
        <h4 className={styles.uiHeading}>{t('Subastas', 'Auctions')}</h4>
        <div className={styles.uiTabs} aria-hidden>
          {tabs.map((tab, i) => <span key={tab} className={i === 0 ? styles.uiTabActive : undefined}>{tab}</span>)}
        </div>
        <ul className={styles.uiList}>
          {rows.map(([title, sub]) => (
            <li key={title}><strong>{title}</strong><span>{sub}</span></li>
          ))}
        </ul>
      </div>
    </DeviceFrame>
  )
}
