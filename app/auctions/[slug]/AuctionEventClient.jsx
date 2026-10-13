'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, InlineLoading, Tag } from '@carbon/react'
import { ArrowRight, View, ViewOff } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import OptimizedImg from '@/components/media/OptimizedImg'
import Countdown, { useRemaining, compactRemaining } from '@/components/auction/Countdown'
import { JoinAuctionModal } from '@/components/auction/AuctionPanel'
import { clockOffset, formatMXN, subscribeAuctionTicks } from '@/lib/auctions'
import { classifyLots, fetchEventBySlug, fetchEventLots, isExtended, isWatchingEvent, lotLabel, refreshAuctions, unwatchEvent, watchEvent } from '@/lib/auctionEvents'
import styles from './AuctionEvent.module.css'

function useNow(offset) {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => { const id = setInterval(() => setNow(Date.now() + offset), 1000); return () => clearInterval(id) }, [offset])
  return now
}

function lotStateLabel(a, t) {
  if (a.status === 'SOLD') return t('Vendido', 'Sold')
  if (a.status === 'RESERVE_NOT_MET') return t('Terminado · Reserva no alcanzada', 'Ended · Reserve not met')
  if (a.status === 'ENDED') return t('Terminado', 'Ended')
  if (a.status === 'CANCELLED') return t('Retirado', 'Withdrawn')
  if (a.status === 'UPCOMING') return t('Próximo', 'Upcoming')
  return isExtended(a) ? t('En vivo · Extendido', 'Live · Extended') : t('En vivo', 'Live')
}

function LotCard({ item, offset, mine }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const a = item.auction
  const open = ['LIVE', 'UPCOMING'].includes(a.status)
  return (
    <Link href={`/artwork/${item.artwork.sku}`} className={styles.lot}>
      <span className={styles.lotNo}>{t('Lote', 'Lot')} {lotLabel(a.lot_number)}</span>
      <span className={styles.lotFrame}>
        {item.artwork.primary_image_url && <OptimizedImg src={item.artwork.primary_image_url} alt={L(item.artwork, 'title')} variant="medium" sizes="(max-width: 640px) 50vw, 25vw" className={styles.lotImage} />}
      </span>
      <span className={styles.lotTitle}>{L(item.artwork, 'title')}</span>
      <span className={styles.lotMeta}>
        <span>{a.current_bid ? t('Puja actual', 'Current bid') : t('Puja inicial', 'Starting bid')}</span>
        <strong>{formatMXN(a.status === 'SOLD' ? a.current_bid : (a.current_bid ?? a.starting_bid), locale)}</strong>
      </span>
      <span className={styles.lotMeta}>
        <span>{a.bid_count} {Number(a.bid_count) === 1 ? t('puja', 'bid') : t('pujas', 'bids')}</span>
        {open ? <Countdown target={a.status === 'UPCOMING' ? a.starts_at : a.ends_at} offset={offset} compact /> : <span>{lotStateLabel(a, t)}</span>}
      </span>
      <span className={styles.lotFoot}>
        <Tag size="sm" type={a.status === 'LIVE' ? 'green' : a.status === 'SOLD' ? 'purple' : 'gray'}>{lotStateLabel(a, t)}</Tag>
        {mine && <Tag size="sm" type={mine === 'leading' ? 'green' : 'red'}>{mine === 'leading' ? t('Vas ganando', 'Leading') : t('Te superaron', 'Outbid')}</Tag>}
      </span>
      <span className={styles.cta}>{t('Ver lote', 'View lot')} →</span>
    </Link>
  )
}

function ClosingNow({ groups, offset }) {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const lead = groups.current[0]
  const ms = useRemaining(lead?.auction.ends_at, offset)
  if (!lead) return null
  const others = groups.current.slice(1)
  return (
    <section className={styles.closing} aria-labelledby="closing-now">
      <p id="closing-now" className={styles.kicker}><span className={styles.liveDot} aria-hidden="true" />{t('Cerrando ahora', 'Closing now')}</p>
      <div className={styles.closingGrid}>
        <Link href={`/artwork/${lead.artwork.sku}`} className={styles.closingFrame}>
          {lead.artwork.primary_image_url && <OptimizedImg src={lead.artwork.primary_image_url} alt={L(lead.artwork, 'title')} variant="large" sizes="(max-width: 900px) 100vw, 55vw" className={styles.closingImage} />}
        </Link>
        <div className={styles.closingInfo}>
          <p className={styles.lotNo}>{t('Lote', 'Lot')} {lotLabel(lead.auction.lot_number)}{isExtended(lead.auction) ? ` · ${t('Extendido', 'Extended')}` : ''}</p>
          <h2 className={styles.closingTitle}>{L(lead.artwork, 'title')}</h2>
          <p className={styles.label}>{lead.auction.current_bid ? t('Puja actual', 'Current bid') : t('Puja inicial', 'Starting bid')}</p>
          <p className={styles.amount}>{formatMXN(lead.auction.current_bid ?? lead.auction.starting_bid, locale)}</p>
          <p className={styles.label}>{t('Cierra en', 'Closing in')}</p>
          <p className={styles.timer} role="timer">{ms == null ? '\u00a0' : compactRemaining(ms)}</p>
          <Link href={`/artwork/${lead.artwork.sku}#auction-panel`}><Button className={styles.full} renderIcon={ArrowRight}>{t('Pujar', 'Place bid')}</Button></Link>
          {(others.length > 0 || groups.next.length > 0) && (
            <ul className={styles.nextList}>
              {[...others, ...groups.next].slice(0, 4).map((i) => (
                <li key={i.auction.id}>
                  <Link href={`/artwork/${i.artwork.sku}`}>
                    <span>{others.includes(i) ? t('También abierto', 'Also open') : t('Siguiente', 'Next')} · {t('Lote', 'Lot')} {lotLabel(i.auction.lot_number)}{isExtended(i.auction) ? ` · ${t('Extendido', 'Extended')}` : ''}</span>
                    <span>{t('cierra en', 'closes in')} <Countdown target={i.auction.ends_at} offset={offset} compact /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {groups.recentlyClosed.length > 0 && (
        <div className={styles.recent}>
          <p className={styles.label}>{t('Cerrados recientemente', 'Recently closed')}</p>
          <ul>
            {groups.recentlyClosed.slice(0, 4).map((i) => (
              <li key={i.auction.id}>
                <span>{t('Lote', 'Lot')} {lotLabel(i.auction.lot_number)}</span>
                <span>{i.auction.status === 'SOLD' ? `${t('Vendido', 'Sold')} · ${t('Puja final', 'Final bid')} ${formatMXN(i.auction.current_bid, locale)}` : `${t('Terminado', 'Ended')}${i.auction.status === 'RESERVE_NOT_MET' ? ` · ${t('Reserva no alcanzada', 'Reserve not met')}` : ''}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default function AuctionEventClient({ slug }) {
  const { t, locale } = useI18n()
  const [event, setEvent] = useState(undefined)
  const [items, setItems] = useState([])
  const [user, setUser] = useState(null)
  const [mine, setMine] = useState(new Map())
  const [watched, setWatched] = useState(new Set())
  const [watchingEvent, setWatchingEvent] = useState(false)
  const [view, setView] = useState('all')
  const [joinOpen, setJoinOpen] = useState(false)

  useEffect(() => { supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null)) }, [])

  const load = useCallback(async () => {
    await refreshAuctions()
    const e = await fetchEventBySlug(slug)
    setEvent(e)
    if (!e) return
    setItems(await fetchEventLots(e.id))
  }, [slug])

  useEffect(() => { load() }, [load])
  useEffect(() => subscribeAuctionTicks(null, load), [load])

  useEffect(() => {
    if (!user?.id || !event?.id) return
    isWatchingEvent(event.id, user.id).then(setWatchingEvent)
    supabase.rpc('my_auctions').then(({ data }) => {
      const m = new Map(); const w = new Set()
      for (const r of data || []) {
        if (r.my_max && r.status === 'LIVE') m.set(r.auction_id, r.is_leading ? 'leading' : 'outbid')
        if (r.watching) w.add(r.auction_id)
      }
      setMine(m); setWatched(w)
    })
  }, [user?.id, event?.id, items])

  const offset = clockOffset(event)
  const now = useNow(offset)
  const groups = useMemo(() => classifyLots(items, now), [items, now])

  if (event === undefined) return <main className={styles.page}><InlineLoading description={t('Cargando subasta…', 'Loading auction…')} /></main>
  if (!event) return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('Subasta no encontrada', 'Auction not found')}</h1>
      <Link href="/catalog">{t('Ver catálogo', 'View catalogue')}</Link>
    </main>
  )

  const status = event.effective_status
  const fmtDate = (d) => new Date(d).toLocaleString(locale, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const firstClose = event.closing_starts_at || event.first_close_at
  const statusText = {
    UPCOMING: t('Próximamente', 'Upcoming'), LIVE: t('Pujas abiertas', 'Bidding open'), CLOSING: t('Cerrando ahora', 'Closing now'),
    ENDED: t('Subasta terminada', 'Auction ended'), CANCELLED: t('Subasta cancelada', 'Auction cancelled'),
  }[status]
  const filtered = items.filter((i) => view === 'all' ? true : view === 'watching' ? watched.has(i.auction.id) : mine.has(i.auction.id))
  const pickView = (v) => { if (v !== 'all' && !user) { setJoinOpen(true); return } setView(v) }
  const toggleWatch = async () => {
    if (!user) { setJoinOpen(true); return }
    if (watchingEvent) await unwatchEvent(event.id, user.id); else await watchEvent(event.id, user.id)
    setWatchingEvent(!watchingEvent)
  }

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        {event.cover_image_url && <img src={event.cover_image_url} alt="" className={styles.cover} />}
        <div className={styles.headText}>
          <p className={styles.kicker}>{status === 'LIVE' || status === 'CLOSING' ? <span className={styles.liveDot} aria-hidden="true" /> : null}{t('Subasta JBU', 'JBU Auction')} · {statusText}</p>
          <h1 className={styles.title}>{event.name}</h1>
          {event.subtitle && <p className={styles.subtitle}>{event.subtitle}</p>}
          <p className={styles.facts}>
            <span>{new Date(event.starts_at).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            <span>{event.lot_count} {Number(event.lot_count) === 1 ? t('lote', 'lot') : t('lotes', 'lots')}</span>
          </p>
          {status === 'UPCOMING' && <p className={styles.countLine}>{t('Las pujas abren en', 'Bidding opens in')} <Countdown target={event.starts_at} offset={offset} compact /></p>}
          {status === 'LIVE' && firstClose && (
            <p className={styles.countLine}>{t('Cierre desde', 'Closes from')} {fmtDate(firstClose)} · {t('el primer lote cierra en', 'first lot closes in')} <Countdown target={firstClose} offset={offset} compact /></p>
          )}
          {event.description && <p className={styles.desc}>{event.description}</p>}
          <div className={styles.actions}>
            {!user && status !== 'ENDED' && status !== 'CANCELLED' && <Button size="md" onClick={() => setJoinOpen(true)}>{t('Regístrate o inicia sesión para pujar', 'Register or sign in to bid')}</Button>}
            {status !== 'ENDED' && status !== 'CANCELLED' && <Button size="md" kind="tertiary" renderIcon={watchingEvent ? ViewOff : View} onClick={toggleWatch}>{watchingEvent ? t('Dejar de seguir', 'Unwatch') : t('Seguir subasta', 'Watch auction')}</Button>}
          </div>
        </div>
      </header>

      {status === 'CLOSING' && <ClosingNow groups={groups} offset={offset} />}

      <section aria-labelledby="lots">
        <div className={styles.toolbar}>
          <h2 id="lots" className={styles.sectionTitle}>{t('Lotes', 'Lots')}</h2>
          <div className={styles.views} role="tablist" aria-label={t('Vista', 'View')}>
            {[['all', t('Todos', 'All lots')], ['watching', t('Siguiendo', 'Watching')], ['mine', t('Mis pujas', 'My bids')]].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? styles.viewOn : styles.view} onClick={() => pickView(k)}>{l}</button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className={styles.empty}>{view === 'all' ? t('Los lotes se publicarán pronto.', 'Lots will be published soon.') : t('Nada por aquí todavía.', 'Nothing here yet.')}</p>
        ) : (
          <div className={styles.grid}>{filtered.map((i) => <LotCard key={i.auction.id} item={i} offset={offset} mine={mine.get(i.auction.id)} />)}</div>
        )}
      </section>
      <JoinAuctionModal open={joinOpen} onClose={() => setJoinOpen(false)} returnTo={`/auctions/${slug}`} />
    </main>
  )
}
