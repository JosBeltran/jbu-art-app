'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Grid } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { fetchEventById, fetchEventLots, lotLabel } from '@/lib/auctionEvents'
import styles from './AuctionEventContext.module.css'

/** Contexto de lote dentro de un evento. No altera el panel de subasta; solo se muestra si hay evento publicado. */
export default function AuctionEventContext({ auction }) {
  const { t } = useI18n()
  const [ctx, setCtx] = useState(null)

  useEffect(() => {
    let active = true
    if (!auction?.auction_event_id) { setCtx(null); return }
    ;(async () => {
      const event = await fetchEventById(auction.auction_event_id)
      if (!event || !active) return
      const lots = await fetchEventLots(event.id)
      const idx = lots.findIndex((l) => l.auction.id === auction.id)
      if (active) setCtx({ event, lots, idx })
    })()
    return () => { active = false }
  }, [auction?.id, auction?.auction_event_id])

  if (!ctx) return null
  const { event, lots, idx } = ctx
  const prev = idx > 0 ? lots[idx - 1] : null
  const next = idx >= 0 && idx < lots.length - 1 ? lots[idx + 1] : null

  return (
    <nav className={styles.ctx} aria-label={t('Lote dentro de la subasta', 'Lot within the auction')}>
      <Link href={`/auctions/${event.slug}`} className={styles.event}>{event.name}</Link>
      <p className={styles.lot}>{t('Lote', 'Lot')} {lotLabel(auction.lot_number)} {t('de', 'of')} {lotLabel(lots.length)}</p>
      <div className={styles.links}>
        {prev ? <Link href={`/artwork/${prev.artwork.sku}`}><ArrowLeft size={16} aria-hidden="true" />{t('Lote anterior', 'Previous lot')}</Link> : <span />}
        <Link href={`/auctions/${event.slug}`}><Grid size={16} aria-hidden="true" />{t('Volver a la subasta', 'Back to auction')}</Link>
        {next ? <Link href={`/artwork/${next.artwork.sku}`}>{t('Siguiente lote', 'Next lot')}<ArrowRight size={16} aria-hidden="true" /></Link> : <span />}
      </div>
    </nav>
  )
}
