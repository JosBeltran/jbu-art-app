'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, InlineNotification, Modal, NumberInput } from '@carbon/react'
import { View, ViewFilled, Login, UserFollow } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { rememberAuthDestination } from '@/lib/authRedirect'
import {
  bidErrorText, clockOffset, fetchAuction, fetchBidHistory, fetchMyState, formatMXN,
  placeBid, startAuctionCheckout, subscribeAuctionTicks, unwatchAuction, watchAuction,
} from '@/lib/auctions'
import Countdown from './Countdown'
import styles from './Auction.module.css'

function timeAgo(date, t, locale) {
  const diff = Math.max(0, Date.now() - new Date(date).getTime()) / 1000
  if (diff < 60) return t('hace un momento', 'just now')
  if (diff < 3600) return t(`hace ${Math.floor(diff / 60)} min`, `${Math.floor(diff / 60)} min ago`)
  if (diff < 86400) return t(`hace ${Math.floor(diff / 3600)} h`, `${Math.floor(diff / 3600)} h ago`)
  return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

export function JoinAuctionModal({ open, onClose, returnTo }) {
  const { t } = useI18n()
  const go = (path) => {
    rememberAuthDestination(returnTo)
    window.location.href = `${path}?next=${encodeURIComponent(returnTo)}`
  }
  return (
    <Modal open={open} onRequestClose={onClose} passiveModal size="xs" modalHeading={t('Únete a la subasta', 'Join the auction')}>
      <div className={styles.joinBody}>
        <p>{t('Inicia sesión o crea tu cuenta de coleccionista para pujar.', 'Sign in or create a collector account to place a bid.')}</p>
        <Button renderIcon={Login} onClick={() => go('/login')} className={styles.fullButton}>{t('Iniciar sesión', 'Sign in')}</Button>
        <Button kind="tertiary" renderIcon={UserFollow} onClick={() => go('/signup')} className={styles.fullButton}>{t('Crear cuenta', 'Create account')}</Button>
      </div>
    </Modal>
  )
}

export function BidHistory({ bids }) {
  const { t, locale } = useI18n()
  if (!bids.length) return <p className={styles.muted}>{t('Aún no hay pujas.', 'No bids yet.')}</p>
  return (
    <ol className={styles.history}>
      {bids.map((b, i) => (
        <li key={`${b.created_at}-${i}`} className={`${styles.historyRow} ${i === 0 ? styles.historyTop : ''}`}>
          <span className={styles.historyWho}>{b.is_mine ? t('Tú', 'You') : b.alias}</span>
          <span className={styles.historyAmount}>{formatMXN(b.amount, locale)}</span>
          <span className={styles.historyWhen}>{timeAgo(b.created_at, t, locale)}</span>
        </li>
      ))}
    </ol>
  )
}

/** @param {{ initialAuction: any, artwork: any, user: any }} props */
export default function AuctionPanel({ initialAuction, artwork, user }) {
  const { t, locale } = useI18n()
  const [auction, setAuction] = useState(initialAuction)
  const [bids, setBids] = useState([])
  const [mine, setMine] = useState(null)
  const [amount, setAmount] = useState(Number(initialAuction?.next_minimum_bid) || 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [pulse, setPulse] = useState(false)
  const lastBid = useRef(initialAuction?.current_bid)
  const offset = useMemo(() => clockOffset(auction), [auction?.server_now])
  const returnTo = `/artwork/${artwork.sku}`

  const refresh = useCallback(async () => {
    const [a, h] = await Promise.all([fetchAuction(auction.id), fetchBidHistory(auction.id)])
    if (a) {
      if (a.current_bid !== lastBid.current) { setPulse(true); setTimeout(() => setPulse(false), 900) }
      lastBid.current = a.current_bid
      setAuction(a)
      setAmount((prev) => (prev < Number(a.next_minimum_bid) ? Number(a.next_minimum_bid) : prev))
    }
    setBids(h)
    if (user) setMine(await fetchMyState(auction.id))
  }, [auction.id, user])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => subscribeAuctionTicks(auction.id, refresh), [auction.id, refresh])

  const live = auction.status === 'LIVE'
  const upcoming = auction.status === 'UPCOMING'
  const extended = Number(auction.extended_count) > 0
  const nextMin = Number(auction.next_minimum_bid)
  const won = mine?.won && auction.status === 'SOLD'

  const submitBid = async () => {
    if (!user) { setJoinOpen(true); return }
    setBusy(true); setError(''); setNotice('')
    const res = await placeBid(auction.id, Number(amount))
    setBusy(false)
    if (!res?.ok) { setError(bidErrorText(res?.message, t)); refresh(); return }
    setNotice(res.extended ? t('Puja registrada. La subasta se extendió.', 'Bid placed. The auction was extended.') : t('Puja registrada. Vas ganando.', 'Bid placed. You are leading.'))
    refresh()
  }

  const toggleWatch = async () => {
    if (!user) { setJoinOpen(true); return }
    if (mine?.watching) await unwatchAuction(auction.id, user.id)
    else await watchAuction(auction.id, user.id)
    setMine(await fetchMyState(auction.id))
  }

  const checkout = async (kind) => {
    if (!user) { setJoinOpen(true); return }
    setBusy(true); setError('')
    try { await startAuctionCheckout(auction.id, kind) } catch (e) { setError(e.message); setBusy(false) }
  }

  const endLabel = new Date(auction.ends_at).toLocaleString(locale, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const startLabel = new Date(auction.starts_at).toLocaleString(locale, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <section className={styles.panel} aria-label={t('Subasta', 'Auction')}>
      <p className={styles.kicker}>
        {live && <><span className={styles.liveDot} aria-hidden="true" />{t('Subasta en vivo', 'Live auction')}</>}
        {upcoming && t('Próxima subasta', 'Upcoming auction')}
        {!live && !upcoming && t('Subasta finalizada', 'Auction ended')}
      </p>

      {won && (
        <div className={styles.won}>
          <p className={styles.wonTitle}>{t('Ganaste', 'You won')}</p>
          {mine.payment_status === 'PAID' ? (
            <p className={styles.muted}>{t('Pago recibido. Gracias por tu adquisición.', 'Payment received. Thank you for your acquisition.')}</p>
          ) : (
            <>
              <p className={styles.muted}>
                {t('Completa el pago para asegurar la obra', 'Complete payment to secure the artwork')}
                {mine.payment_due_at ? ` · ${t('antes del', 'before')} ${new Date(mine.payment_due_at).toLocaleString(locale, { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
              </p>
              <Button className={styles.fullButton} disabled={busy} onClick={() => checkout('pay')}>{t('Pagar', 'Pay now')} · {formatMXN(auction.current_bid, locale)}</Button>
            </>
          )}
        </div>
      )}

      {upcoming ? (
        <>
          <p className={styles.label}>{t('Las pujas abren', 'Bidding opens')}</p>
          <p className={styles.bigLine}>{startLabel}</p>
          <p className={styles.label}>{t('Puja inicial', 'Starting bid')}</p>
          <p className={styles.amount}>{formatMXN(auction.starting_bid, locale)}</p>
          <Countdown target={auction.starts_at} offset={offset} onEnd={refresh} />
        </>
      ) : (
        <>
          <p className={styles.label}>{auction.current_bid ? t('Puja actual', 'Current bid') : t('Puja inicial', 'Starting bid')}</p>
          <p className={`${styles.amount} ${pulse ? styles.pulse : ''}`} aria-live="polite">{formatMXN(auction.current_bid ?? auction.starting_bid, locale)}</p>
          <p className={styles.meta}>
            <span>{auction.bid_count} {Number(auction.bid_count) === 1 ? t('puja', 'bid') : t('pujas', 'bids')}</span>
            {auction.has_reserve && <span>{auction.reserve_met ? t('Reserva alcanzada', 'Reserve met') : t('Reserva no alcanzada', 'Reserve not met')}</span>}
            {live && mine?.is_leading && <span className={styles.leading}>{t('Vas ganando', 'You are leading')}</span>}
            {live && !mine?.is_leading && mine?.my_max && <span>{t('Te superaron', 'Outbid')}</span>}
          </p>
        </>
      )}

      {live && (
        <>
          <div className={styles.bidBox}>
            <NumberInput
              id={`bid-${auction.id}`}
              label={`${t('Siguiente puja mínima', 'Next minimum bid')} · ${formatMXN(nextMin, locale)}`}
              min={nextMin}
              step={Number(auction.minimum_increment) || 100}
              value={amount}
              onChange={(_, { value }) => setAmount(Number(value))}
              hideSteppers={false}
              allowEmpty={false}
            />
            <Button className={styles.fullButton} disabled={busy || mine?.is_leading} onClick={submitBid}>
              {mine?.is_leading ? t('Vas ganando', 'You are leading') : t('Pujar', 'Place bid')}
            </Button>
          </div>
          <p className={styles.fine}>{t('Pujar es un compromiso de compra. No se hace ningún cargo hasta que la subasta termine.', 'A bid is a commitment to buy. Nothing is charged until the auction ends.')}</p>

          {auction.buy_now_price && (
            <div className={styles.buyNow}>
              <p className={styles.label}>{t('Adquirir de inmediato', 'Acquire immediately')}</p>
              <p className={styles.bigLine}>{formatMXN(auction.buy_now_price, locale)}</p>
              <Button kind="tertiary" className={styles.fullButton} disabled={busy} onClick={() => checkout('buy_now')}>{t('Comprar ya', 'Buy now')}</Button>
            </div>
          )}

          <div className={styles.endBlock}>
            {extended && <p className={styles.extended}>{t('Subasta extendida', 'Auction extended')}</p>}
            <p className={styles.label}>{t('Termina', 'Ends')} · {endLabel}</p>
            <Countdown target={auction.ends_at} offset={offset} onEnd={refresh} />
          </div>
        </>
      )}

      {error && <InlineNotification kind="error" lowContrast title={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title={notice} onCloseButtonClick={() => setNotice('')} />}

      {(live || upcoming) && (
        <Button kind="ghost" size="sm" renderIcon={mine?.watching ? ViewFilled : View} onClick={toggleWatch}>
          {mine?.watching ? t('Siguiendo la subasta', 'Watching auction') : t('Seguir subasta', 'Watch auction')}
        </Button>
      )}

      {!upcoming && (
        <div className={styles.historyBlock}>
          <p className={styles.label}>{t('Historial de pujas', 'Bid history')}</p>
          <BidHistory bids={bids} />
        </div>
      )}

      {!live && !upcoming && !won && (
        <p className={styles.muted}>
          {auction.status === 'RESERVE_NOT_MET' ? t('La subasta terminó sin alcanzar la reserva.', 'The auction ended without meeting the reserve.') : auction.status === 'SOLD' ? t('Obra adjudicada.', 'Artwork sold.') : t('Subasta cerrada.', 'Auction closed.')}
          {' '}<Link href="/catalog">{t('Ver catálogo', 'View catalog')}</Link>
        </p>
      )}

      <JoinAuctionModal open={joinOpen} onClose={() => setJoinOpen(false)} returnTo={returnTo} />
    </section>
  )
}

/** Barra móvil compacta: puja actual, tiempo y botón. */
export function AuctionMobileBar({ auction, onAction }) {
  const { t, locale } = useI18n()
  const offset = clockOffset(auction)
  return (
    <div className={styles.mobileBar}>
      <div>
        <span className={styles.mobileLabel}>{auction.status === 'LIVE' ? <><span className={styles.liveDot} aria-hidden="true" />{t('En vivo', 'Live')}</> : t('Próxima', 'Upcoming')}</span>
        <span className={styles.mobileValue}>{formatMXN(auction.current_bid ?? auction.starting_bid, locale)}</span>
        <Countdown target={auction.status === 'LIVE' ? auction.ends_at : auction.starts_at} offset={offset} compact />
      </div>
      <Button size="md" onClick={onAction}>{auction.status === 'LIVE' ? t('Pujar', 'Place bid') : t('Ver', 'View')}</Button>
    </div>
  )
}
