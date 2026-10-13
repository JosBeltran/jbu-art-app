'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import OptimizedImg from '@/components/media/OptimizedImg'
import { clockOffset, formatMXN, subscribeAuctionTicks } from '@/lib/auctions'
import Countdown from './Countdown'
import { fetchEventLots } from '@/lib/auctionEvents'
import styles from './Auction.module.css'

function AuctionCard({ auction, artwork }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const live = auction.status === 'LIVE'
  const offset = clockOffset(auction)
  return (
    <Link href={`/artwork/${artwork.sku}`} className={styles.card}>
      <span className={styles.cardFrame}>
        {artwork.primary_image_url && <OptimizedImg src={artwork.primary_image_url} alt={L(artwork, 'title')} variant="medium" sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, 33vw" className={styles.cardImage} />}
      </span>
      <span className={styles.subhead}>
        {live ? <><span className={styles.liveDot} aria-hidden="true" />{t('En vivo', 'Live')}</> : t('Próxima subasta', 'Upcoming auction')}
      </span>
      <h3 className={styles.cardTitle}>{L(artwork, 'title')}</h3>
      {live ? (
        <>
          <span className={styles.cardRow}>
            <span>
              <span className={styles.label} style={{ display: 'block', margin: 0 }}>{auction.current_bid ? t('Puja actual', 'Current bid') : t('Puja inicial', 'Starting bid')}</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 300 }}>{formatMXN(auction.current_bid ?? auction.starting_bid, locale)}</span>
            </span>
            <span className={styles.muted}>{auction.bid_count} {Number(auction.bid_count) === 1 ? t('puja', 'bid') : t('pujas', 'bids')}</span>
          </span>
          <span className={styles.cardRow}>
            <Countdown target={auction.ends_at} offset={offset} compact />
            <span className={styles.cardCta}>{t('Ver subasta', 'View auction')}</span>
          </span>
        </>
      ) : (
        <span className={styles.cardRow}>
          <span>
            <span className={styles.label} style={{ display: 'block', margin: 0 }}>{t('Las pujas abren', 'Bidding opens')}</span>
            <span>{new Date(auction.starts_at).toLocaleString(locale, { weekday: 'long', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}</span>
          </span>
          <span className={styles.cardCta}>{t('Seguir subasta', 'Watch auction')}</span>
        </span>
      )}
    </Link>
  )
}

function EventPromo({ event, items }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const live = ['LIVE', 'CLOSING'].includes(event.effective_status)
  const offset = clockOffset(event)
  const preview = items.slice(0, 4)
  return (
    <Link href={`/auctions/${event.slug}`} className={styles.eventPromo}>
      <span className={styles.eventMosaic}>
        {event.cover_image_url
          ? <img src={event.cover_image_url} alt="" className={styles.eventCover} />
          : preview.map((i) => i.artwork.primary_image_url && <OptimizedImg key={i.auction.id} src={i.artwork.primary_image_url} alt={L(i.artwork, 'title')} variant="medium" sizes="(max-width: 640px) 50vw, 25vw" className={styles.cardImage} />)}
      </span>
      <span className={styles.eventText}>
        <span className={styles.subhead}>{live ? <><span className={styles.liveDot} aria-hidden="true" />{t('Subasta en vivo', 'Live auction')}</> : t('Próxima subasta', 'Upcoming auction')}</span>
        <h3 className={styles.homeTitle}>{event.name}</h3>
        <span className={styles.muted}>{event.lot_count} {Number(event.lot_count) === 1 ? t('lote', 'lot') : t('lotes', 'lots')} · {live
          ? (event.effective_status === 'CLOSING' ? t('Cerrando ahora', 'Closing now') : t('Pujas abiertas', 'Bidding now open'))
          : `${t('Las pujas abren', 'Bidding opens')} ${new Date(event.starts_at).toLocaleDateString(locale, { month: 'long', day: 'numeric' })}`}</span>
        {!live && <Countdown target={event.starts_at} offset={offset} compact />}
        <span className={styles.cardCta}>{live ? t('Ver subasta', 'View auction') : t('Ver lotes', 'View lots')} →</span>
      </span>
    </Link>
  )
}

/** Sección reutilizable "Subastas". No se muestra si no hay subastas abiertas. */
export default function HomeAuctions() {
  const { t } = useI18n()
  const [items, setItems] = useState([])
  const [events, setEvents] = useState([])

  const load = useCallback(async () => {
    try { await supabase.rpc('settle_auctions', { _auction: null }) } catch { /* sin migración */ }
    let evs = []
    try {
      const { data } = await supabase.from('auction_events_public').select('*').eq('featured', true).in('effective_status', ['UPCOMING', 'LIVE', 'CLOSING']).order('starts_at', { ascending: true }).limit(2)
      evs = await Promise.all((data || []).map(async (e) => ({ event: e, items: await fetchEventLots(e.id) })))
    } catch { /* sin migración de eventos */ }
    setEvents(evs)
    const featuredIds = new Set(evs.map((e) => e.event.id))
    const { data: auctionsAll, error } = await supabase.from('auctions_public').select('*').in('status', ['LIVE', 'UPCOMING']).order('ends_at', { ascending: true }).limit(12)
    const auctions = (auctionsAll || []).filter((a) => !a.auction_event_id || !featuredIds.has(a.auction_event_id))
    if (error || !auctions.length) { setItems([]); return }
    const { data: arts } = await supabase.from('artworks').select('*').in('id', auctions.map((a) => a.artwork_id))
    const byId = new Map((arts || []).map((a) => [a.id, a]))
    setItems(auctions.filter((a) => byId.has(a.artwork_id)).map((a) => ({ auction: a, artwork: byId.get(a.artwork_id) })))
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => subscribeAuctionTicks(null, load), [load])

  if (!items.length && !events.length) return null
  const live = items.filter((i) => i.auction.status === 'LIVE')
  const upcoming = items.filter((i) => i.auction.status === 'UPCOMING')

  return (
    <section className={styles.homeSection} aria-labelledby="home-auctions">
      <header className={styles.homeHead}>
        <p className={styles.kicker}>{t('Subastas', 'Auctions')}</p>
        <h2 id="home-auctions" className={styles.homeTitle}>{live.length || events.some((e) => e.event.effective_status !== 'UPCOMING') ? t('En vivo ahora', 'Live now') : t('Próximas subastas', 'Upcoming auctions')}</h2>
      </header>
      {events.map((e) => <EventPromo key={e.event.id} {...e} />)}
      {live.length > 0 && (
        <div className={`${styles.homeGrid} ${live.length === 1 ? styles.single : ''}`}>
          {live.map((i) => <AuctionCard key={i.auction.id} {...i} />)}
        </div>
      )}
      {live.length > 0 && upcoming.length > 0 && <p className={styles.subhead}>{t('Próximas', 'Upcoming')}</p>}
      {upcoming.length > 0 && (
        <div className={`${styles.homeGrid} ${upcoming.length === 1 && !live.length ? styles.single : ''}`}>
          {upcoming.map((i) => <AuctionCard key={i.auction.id} {...i} />)}
        </div>
      )}
    </section>
  )
}
