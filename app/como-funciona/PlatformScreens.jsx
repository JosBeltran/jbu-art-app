'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import OptimizedImg from '@/components/media/OptimizedImg'
import Countdown from '@/components/auction/Countdown'
import { clockOffset, formatMXN } from '@/lib/auctions'
import { getArtworks } from '@/lib/artworks'
import { USER_LEVELS } from '@/lib/userLevels'
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

/* ---------- Obras reales compartidas por las vistas previas ---------- */

let artworksPromise = null
function loadArtworks() {
  if (!artworksPromise) artworksPromise = getArtworks().catch(() => [])
  return artworksPromise
}

/** Obra pública real: disponible para compra o adquirida con certificado. Se elige al azar en cada visita. */
function usePreviewArtwork(kind = 'available') {
  const [state, setState] = useState(null)
  useEffect(() => {
    let alive = true
    loadArtworks().then(async (rows) => {
      const withImage = (rows || []).filter((a) => a.primary_image_url)
      const pool = kind === 'owned'
        ? withImage.filter((a) => a.status === 'OWNED' && a.certificate_hash)
        : withImage.filter((a) => a.status === 'AVAILABLE' && Number(a.calculated_price_mxn || a.base_price_mxn) > 0)
          .filter((a) => kind !== 'offer' || a.accepts_offers !== false)
      // Índice estable por tipo para que dos pasos no muestren la misma obra cuando hay varias.
      const offset = { available: 0, detail: 1, offer: 2, owned: 0 }[kind] || 0
      const seed = Math.floor(Math.random() * Math.max(pool.length, 1))
      const art = pool.length ? pool[(seed + offset) % pool.length] : null
      if (!art) { if (alive) setState({ empty: true }); return }
      let extra = {}
      if (kind === 'detail') {
        const [{ data: media }, { data: prov }] = await Promise.all([
          supabase.from('artwork_images').select('media_type').eq('artwork_id', art.id).eq('media_type', 'video').limit(1),
          supabase.from('artwork_provenance_public').select('title, event_date, created_at').eq('artwork_id', art.id).order('created_at', { ascending: true }).limit(2),
        ]).catch(() => [{}, {}])
        extra = { hasVideo: Boolean(media?.length || art.intro_video_id), provenance: prov || [] }
      }
      if (alive) setState({ art, ...extra })
    })
    return () => { alive = false }
  }, [kind])
  return state
}

const priceOf = (art) => Number(art?.calculated_price_mxn || art?.base_price_mxn || 0)

function Loading() {
  return <DeviceFrame><div className={styles.uiLoading} aria-hidden /></DeviceFrame>
}

function Illustrative({ caption, children }) {
  return <DeviceFrame caption={caption}><div className={styles.ui}>{children}</div></DeviceFrame>
}

/** 01 · Descubrir: una obra real del catálogo con su colección. */
export function DiscoverScreen() {
  const { t } = useI18n()
  const L = useLocalized()
  const state = usePreviewArtwork('available')
  if (!state) return <Loading />
  if (state.empty) return (
    <Illustrative caption={t('Vista ilustrativa del catálogo', 'Illustrative catalog view')}>
      <p className={styles.uiKicker}>{t('Catálogo', 'Catalog')}</p><div className={styles.uiArt} />
      <p className={styles.uiMuted}>{t('Obra original · Colecciones · Subastas', 'Original work · Collections · Auctions')}</p>
    </Illustrative>
  )
  const { art } = state
  return (
    <DeviceFrame caption={t('Datos reales de la plataforma', 'Live platform data')}>
      <Link href="/catalog" className={styles.ui}>
        <p className={styles.uiKicker}>{t('Catálogo', 'Catalog')}{art.series ? ` · ${art.series}` : ''}</p>
        <div className={styles.uiArt}><OptimizedImg src={art.primary_image_url} alt={L(art, 'title')} variant="medium" sizes="26rem" className={styles.uiArtImg} /></div>
        <h4 className={styles.uiTitle}>{L(art, 'title')}</h4>
        <p className={styles.uiMuted}>{t('Disponible', 'Available')}</p>
        <span className={styles.uiSecondary}>{t('Ver catálogo', 'View catalog')}</span>
      </Link>
    </DeviceFrame>
  )
}

/** 02 · Ficha: ficha técnica, video, procedencia y señales públicas reales. */
export function ArtworkDetailScreen() {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const state = usePreviewArtwork('detail')
  if (!state) return <Loading />
  if (state.empty) return (
    <Illustrative caption={t('Vista ilustrativa de una ficha', 'Illustrative artwork page')}>
      <p className={styles.uiKicker}>{t('Ficha de obra', 'Artwork page')}</p><div className={styles.uiArt} />
      <p className={styles.uiMuted}>{t('Medidas · Técnica · Disponibilidad · Provenance & Evolution', 'Dimensions · Technique · Availability · Provenance & Evolution')}</p>
    </Illustrative>
  )
  const { art, hasVideo, provenance } = state
  const views = Number(art.views_count || 0)
  const favs = Number(art.favorites_count || 0)
  const impact = Number(art.impact_score || 0)
  return (
    <DeviceFrame caption={t('Datos reales de la plataforma', 'Live platform data')}>
      <Link href={`/artwork/${art.sku}`} className={styles.ui}>
        <p className={styles.uiKicker}>{t('Ficha de obra', 'Artwork page')}{hasVideo ? ` · ${t('Video', 'Video')}` : ''}</p>
        <div className={styles.uiArt}><OptimizedImg src={art.primary_image_url} alt={L(art, 'title')} variant="medium" sizes="26rem" className={styles.uiArtImg} /></div>
        <h4 className={styles.uiTitle}>{L(art, 'title')}</h4>
        <dl className={styles.uiSpecs}>
          {art.dimensions && <div><dt>{t('Medidas', 'Dimensions')}</dt><dd>{art.dimensions}</dd></div>}
          {(L(art, 'medium') || art.medium) && <div><dt>{t('Técnica', 'Technique')}</dt><dd>{L(art, 'medium') || art.medium}</dd></div>}
          <div><dt>{t('Estado', 'Status')}</dt><dd>{t('Disponible', 'Available')}</dd></div>
        </dl>
        {(views > 0 || favs > 0 || impact > 0) && (
          <p className={styles.uiMetrics}>
            {views > 0 && <span>{views.toLocaleString(locale)} {t('vistas', 'views')}</span>}
            {favs > 0 && <span>{favs.toLocaleString(locale)} {t('favoritos', 'favorites')}</span>}
            {impact > 0 && <span>{t('Impulsada', 'Boosted')}</span>}
          </p>
        )}
        {provenance?.length > 0 && (
          <div className={styles.uiProv}>
            <p className={styles.uiLabel}>Provenance &amp; Evolution</p>
            {provenance.map((p, i) => <p key={i} className={styles.uiMuted}>{p.title}</p>)}
          </div>
        )}
      </Link>
    </DeviceFrame>
  )
}

/** 03A · Compra directa con Stripe, precio real. */
export function BuyScreen() {
  const { t, locale } = useI18n()
  const L = useLocalized()
  const state = usePreviewArtwork('available')
  if (!state) return <Loading />
  const art = state.art
  return (
    <DeviceFrame caption={art ? t('Datos reales de la plataforma', 'Live platform data') : t('Vista ilustrativa', 'Illustrative view')}>
      <Link href={art ? `/artwork/${art.sku}` : '/catalog'} className={`${styles.ui} ${styles.uiCompact}`}>
        <p className={styles.uiKicker}>{t('Compra directa', 'Buy directly')}</p>
        {art && <div className={styles.uiThumbRow}><div className={styles.uiThumb}><OptimizedImg src={art.primary_image_url} alt="" variant="thumb" sizes="5rem" className={styles.uiArtImg} /></div><div><h4 className={styles.uiTitleSm}>{L(art, 'title')}</h4><p className={styles.uiAmount}>{formatMXN(priceOf(art), locale)}</p></div></div>}
        <span className={styles.uiPrimary}>{t('Adquirir', 'Acquire')}</span>
        <p className={styles.uiFine}>{t('Pago seguro con Stripe', 'Secure payment with Stripe')}</p>
      </Link>
    </DeviceFrame>
  )
}

/** 03B · Oferta: reproduce el formulario real (monto + enviar); estado inicial real: pendiente. */
export function OfferScreen() {
  const { t } = useI18n()
  const L = useLocalized()
  const state = usePreviewArtwork('offer')
  if (!state) return <Loading />
  const art = state.art
  return (
    <DeviceFrame caption={t('Vista ilustrativa del formulario de oferta', 'Illustrative offer form')}>
      <Link href={art ? `/artwork/${art.sku}` : '/catalog'} className={`${styles.ui} ${styles.uiCompact}`}>
        <p className={styles.uiKicker}>{t('Hacer una oferta', 'Make an offer')}</p>
        {art && <h4 className={styles.uiTitleSm}>{L(art, 'title')}</h4>}
        <p className={styles.uiLabel}>{t('Tu oferta (MXN)', 'Your offer (MXN)')}</p>
        <span className={styles.uiField} aria-hidden>$ —</span>
        <span className={styles.uiPrimary}>{t('Enviar oferta', 'Submit offer')}</span>
        <p className={styles.uiFine}>{t('Estado: Pendiente de respuesta', 'Status: Awaiting response')}</p>
      </Link>
    </DeviceFrame>
  )
}

/** 04 · Pedido: etiquetas reales del sistema de pedidos, sin número inventado. */
export function OrderScreen() {
  const { t } = useI18n()
  const steps = [t('Pago confirmado', 'Payment confirmed'), t('En preparación', 'In preparation'), t('En camino', 'Shipped'), t('Entregado', 'Delivered')]
  return (
    <DeviceFrame caption={t('Vista ilustrativa de un pedido', 'Illustrative order view')}>
      <Link href="/profile" className={styles.ui}>
        <p className={styles.uiKicker}>{t('Pedido', 'Order')} #········</p>
        <h4 className={styles.uiHeading}>{t('Pago confirmado', 'Payment confirmed')}</h4>
        <ol className={styles.uiSteps}>
          {steps.map((s, i) => <li key={s} className={i <= 1 ? styles.uiStepDone : undefined}>{s}</li>)}
        </ol>
        <p className={styles.uiMuted}>{t('Número de pedido, estado y entrega en tu cuenta.', 'Order number, status and delivery in your account.')}</p>
        <span className={styles.uiSecondary}>{t('Ver pedido', 'View order')}</span>
      </Link>
    </DeviceFrame>
  )
}

/** 05 · Mi espacio: secciones reales de la cuenta, sin cifras. */
export function ActivityScreen() {
  const { t } = useI18n()
  const groups = [
    [t('Subastas', 'Auctions'), t('Siguiendo · Pujando · Ganadas', 'Watching · Bidding · Won')],
    [t('Ofertas', 'Offers'), t('Enviadas y respuestas', 'Sent and replies')],
    [t('Pedidos', 'Orders'), t('Pago, preparación y envío', 'Payment, preparation and shipping')],
    [t('Favoritos', 'Favorites'), t('Obras guardadas', 'Saved works')],
    [t('Impulsos', 'Boosts'), t('Obras que impulsaste', 'Works you boosted')],
  ]
  return (
    <DeviceFrame caption={t('Vista ilustrativa de tu espacio', 'Illustrative view of your space')}>
      <Link href="/profile" className={styles.ui}>
        <p className={styles.uiKicker}>{t('Mi espacio', 'My space')}</p>
        <ul className={styles.uiList}>
          {groups.map(([title, sub]) => <li key={title}><strong>{title}</strong><span>{sub}</span></li>)}
        </ul>
        <span className={styles.uiSecondary}>{t('Ir a mi espacio', 'Go to my space')}</span>
      </Link>
    </DeviceFrame>
  )
}

/** 06 · Certificado público real de una obra adquirida + niveles reales de coleccionista. */
export function CertificateScreen() {
  const { t } = useI18n()
  const L = useLocalized()
  const state = usePreviewArtwork('owned')
  if (!state) return <Loading />
  const art = state.art
  const lvl = USER_LEVELS[1]
  return (
    <DeviceFrame caption={art ? t('Certificado público real', 'Real public certificate') : t('Vista ilustrativa del certificado', 'Illustrative certificate')}>
      <Link href={art ? `/verify/${encodeURIComponent(art.sku)}` : '/collection'} className={`${styles.ui} ${styles.uiCert}`}>
        <p className={styles.uiKicker}>{t('Certificado digital de autenticidad', 'Digital Certificate of Authenticity')}</p>
        {art && <div className={styles.uiArt}><OptimizedImg src={art.primary_image_url} alt={L(art, 'title')} variant="medium" sizes="26rem" className={styles.uiArtImg} /></div>}
        <dl className={styles.uiSpecs}>
          <div><dt>{t('Obra', 'Artwork')}</dt><dd>{art ? L(art, 'title') : '—'}</dd></div>
          <div><dt>{t('Artista', 'Artist')}</dt><dd>Josué Beltrán Uresti</dd></div>
          {art && <div><dt>{t('Registro', 'Record')}</dt><dd>{art.sku}</dd></div>}
          <div><dt>{t('Estado', 'Status')}</dt><dd>{art ? t('Adquirida · Registro verificado', 'Acquired · Verified record') : '—'}</dd></div>
        </dl>
        <span className={styles.uiPrimary}>{t('Ver certificado', 'View certificate')}</span>
        <span className={styles.uiSecondary}>{t('Descargar PDF', 'Download PDF')}</span>
        <div className={styles.uiLevel}><p className={styles.uiLabel}>{t('Nivel de coleccionista', 'Collector level')}</p><p className={styles.uiMuted}>{t('Ej.', 'E.g.')} {t('Nivel', 'Level')} {lvl.level} — {t(lvl.name, lvl.name_en)}</p></div>
      </Link>
    </DeviceFrame>
  )
}
