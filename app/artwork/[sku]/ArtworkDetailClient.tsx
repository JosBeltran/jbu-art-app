'use client'
import { useCookieConsent } from '@/components/consent/CookieConsent'
import { allowsAnalytics } from '@/lib/cookieConsent'
import { isArtworkPurchasable, getAvailability, publicStatusLabel } from '@/lib/artworkStatus'
import { useMarket } from '@/components/market/MarketProvider'
import PurchaseBenefits from '@/components/purchase/PurchaseBenefits'
import LocalDeliveryInfo from '@/components/purchase/LocalDeliveryInfo'
import { usePurchaseShipping } from '@/components/shipping/usePurchaseShipping'
import { browsingCountry } from '@/lib/market'
import { itemAvailableInCountry } from '@/lib/countryAvailability'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Button,
  Tag,
  Breadcrumb,
  BreadcrumbItem,
  InlineNotification
} from '@carbon/react'
import {
  ShoppingCart,
  Checkmark,
  Launch,
  ArrowRight,
  Maximize,
  Favorite,
  FavoriteFilled,
  TagEdit,
  View
} from '@carbon/icons-react'

import { supabase } from '@/lib/supabaseClient'
import { getArtworks } from '@/lib/artworks'
import { safeRedirectPath } from '@/lib/authRedirect'
import { ARTWORK_PLACEHOLDER, handleArtworkImageError } from '@/lib/artworkPlaceholder'
import OptimizedImg from '@/components/media/OptimizedImg'
import ArtworkQR from '@/components/ArtworkQR'
import BuyButton from '@/components/BuyButton'
import AskForPriceButton from '@/components/AskForPriceButton'
import { getArtworkCommercePresentation } from '@/lib/artworkCommerce'
import { useCart } from '@/context/CartContext'
import TierProgressBar from '@/components/TierProgressBar'
import PointBoostWidget from '@/components/PointBoostWidget'
import TopBoosters from '@/components/TopBoosters'
import MakeOfferModal from '@/components/MakeOfferModal'
import ArtworkShare from '@/components/share/ArtworkShare'
import PendingPayment from '@/components/auction/PendingPayment'
import { shippingErrorText } from '@/lib/shippingCountries'
import {fetchPayment,payPending} from '@/lib/payments/pending.client'
import AuctionPanel, { AuctionMobileBar } from '@/components/auction/AuctionPanel'
import PhysicalEditionAvailability from '@/components/PhysicalEditionAvailability'
import PhysicalEditionSpecifications from '@/components/PhysicalEditionSpecifications'
import { isPhysicalEdition, editionAvailability, editionDesignation } from '@/lib/physicalEdition'
import PhysicalEditionBuyButton from '@/components/PhysicalEditionBuyButton'
import AuctionEventContext from '@/components/auction/AuctionEventContext'
import { fetchArtworkAuction } from '@/lib/auctions'
import ArtworkLightbox from '@/components/ArtworkLightbox'
import MediaGallery from '@/components/media/MediaGallery'
import { artworkPrintHref } from '@/lib/printRoutes'
import { isPurchasablePrintVariant } from '@/lib/catalogPrintAvailability'
import ArtworkVideoReveal from '@/components/media/ArtworkVideoReveal'
import { buildArtworkMedia } from '@/lib/artworkMedia'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { localizedSeriesName } from '@/lib/seriesContent'
import { DiscussionButton } from '@/components/comments/ArtworkDiscussion'
import ArtworkDiscussionModal, { DiscussionPanel } from '@/components/comments/ArtworkDiscussionModal'
import { printGalleryImages } from '@/lib/printGallery'
import { ARTWORK_DISCUSSION, clearDiscussionDestination, discussionKey, parseDiscussion } from '@/lib/artworkDiscussion'
import { useCurrency, ExchangeNote } from '@/components/CurrencyProvider'
import { inchesFromCmText } from '@/lib/dimensions'
import styles from './ArtworkDetail.module.css'

interface ArtworkDetailClientProps {
  artwork: any
  commentsEnabled?: boolean
  country?: string | null
  siteSettings?: any
  social?: { config: object; presentation: { title: string; artist: string; description: string; domain: string }; version: string; titleEn: string } | null
}


export default function ArtworkDetailClient({ artwork, siteSettings = null, social = null, country = null, commentsEnabled = false }: ArtworkDetailClientProps) {
  const router = useRouter()
  const market = useMarket()
  const params = useSearchParams()
  const destination = browsingCountry(params.get('country'), market.country || country)
  const { consent } = useCookieConsent()
  const { t, locale, lang } = useI18n()
  const localized = useLocalized()
  const { price: displayPrice } = useCurrency()
  const inches = lang === 'en' ? inchesFromCmText(artwork?.dimensions) : null

  const [user, setUser] = useState<any>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [addingOriginal, setAddingOriginal] = useState(false)

  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [favoriteError, setFavoriteError] = useState('')
  const [favoritesCount, setFavoritesCount] = useState<number>(Number(artwork?.favorites_count || 0))
  // Cada obra decide explícitamente si recibe ofertas; sin el permiso no se muestra nada de ofertas
  const acceptsOffers = artwork?.accepts_offers === true
  const [viewsCount, setViewsCount] = useState<number>(Number(artwork?.views_count || 0))
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false)
  // Subasta (módulo aislado): si no hay subasta abierta, la ficha queda igual
  const [auction, setAuction] = useState<any>(null)
  useEffect(() => {
    let active = true
    fetchArtworkAuction(artwork?.id).then((a) => { if (active) setAuction(a) })
    return () => { active = false }
  }, [artwork?.id])
  const [payment,setPayment]=useState<any>(null)
  const [paymentError,setPaymentError]=useState('')
  const [paymentBusy,setPaymentBusy]=useState(false)
  // El primer render debe ser idéntico en servidor y navegador; el reloj empieza tras montar.
  const [now,setNow]=useState(0)
  const requestVersion=useRef(0)
  useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  useEffect(()=>{
    const version=++requestVersion.current;setPayment(null)
    if(!user?.id)return
    const refresh=async()=>{try{const result=await fetchPayment(artwork.id);if(requestVersion.current===version){setPayment(result);setPaymentError('')}}catch(e:any){if(requestVersion.current===version)setPaymentError(e.message)}}
    refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh)
    return()=>{requestVersion.current++;clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[artwork.id,user?.id])
  const pay=async()=>{if(!payment)return;setPaymentBusy(true);try{await payPending(payment)}catch(e:any){setPaymentError(shippingErrorText(e.message, t));setPaymentBusy(false)}}
  const exclusivePayment=now>0&&payment?.payment_status==='PENDING'&&Date.parse(payment.payment_due_at)>now
  const showAuction=!isPhysicalEdition(artwork)&&Boolean(auction)&&!(payment?.source==='OFFER'&&exclusivePayment)


  const [mediaRows, setMediaRows] = useState<any[]>(artwork.original_media_rows || [])
  const [seriesArtworks, setSeriesArtworks] = useState<any[]>([])
  const [seriesRows, setSeriesRows] = useState<any[]>([])
  useEffect(() => {
    if (!artwork?.series) return
    supabase.from('series').select('*').ilike('title', artwork.series).limit(1)
      .then(({ data }) => setSeriesRows(data || []), () => setSeriesRows([]))
  }, [artwork?.series])
  const seriesName = localizedSeriesName(artwork?.series, seriesRows, String(locale).startsWith('en') ? 'en' : 'es')
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const { addToCart, cart } = useCart()

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
      setLoadingAuth(false)
    }
    checkUser()
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(!session){requestVersion.current++;setPayment(null)}setUser(session?.user||null)})
    return()=>data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function checkFavorite() {
      if (!user?.id || !artwork?.id) {
        setIsFavorite(false)
        return
      }
      const { data } = await supabase
        .from('artwork_favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('artwork_id', artwork.id)
        .maybeSingle()
      setIsFavorite(Boolean(data))
    }
    checkFavorite()
  }, [user?.id, artwork?.id])

  useEffect(() => {
    async function registerView() {
      if (!artwork?.id || typeof window === 'undefined' || !allowsAnalytics()) return
      const sessionKey = `jbu:viewed-artwork:${artwork.id}`
      try {
        if (window.sessionStorage.getItem(sessionKey)) return
        window.sessionStorage.setItem(sessionKey, '1')
      } catch {
        /* sessionStorage no disponible */
      }
      const { data, error } = await supabase.rpc('increment_artwork_view', {
        target_artwork_id: artwork.id
      })
      if (!error && typeof data === 'number') {
        setViewsCount(data)
      }
    }
    registerView()
  }, [artwork?.id, consent?.analytics])

  const mediaItems = useMemo(() => buildArtworkMedia(artwork, mediaRows, t), [artwork, mediaRows, t])

  // Introducción cinemática: solo si la obra tiene un video de su galería elegido como intro.
  const [showIntro, setShowIntro] = useState(Boolean(artwork?.intro_video_id))
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const introVideo = useMemo(() => {
    if (!artwork?.intro_video_id) return null
    return (mediaRows || []).find((row: any) => String(row.id) === String(artwork.intro_video_id) && row.media_type === 'video' && row.image_url) || null
  }, [artwork?.intro_video_id, mediaRows])

  useEffect(() => {
    async function fetchGalleryData() {
      if (!artwork?.id) return

      const { data: imagesData } = await supabase
        .from('artwork_images')
        .select('*')
        .eq('artwork_id', artwork.id)
        .order('display_order', { ascending: true })

      if (imagesData && imagesData.length > 0) {
        setMediaRows(imagesData)
      }
      setMediaLoaded(true)

      if (artwork?.series) {
        const seriesData = await getArtworks({ series: artwork.series, excludeId: artwork.id, limit: 6 })
        setSeriesArtworks(seriesData)
      }

    }
    fetchGalleryData()
  }, [artwork?.id, artwork?.series])

  const currentStatus = getAvailability(artwork)
  const isSold = currentStatus === 'SOLD'
  const isPhysicalLimited = isPhysicalEdition(artwork)
  const isOriginalAvailable = isArtworkPurchasable(artwork) && !exclusivePayment && !isPhysicalLimited && itemAvailableInCountry(artwork, destination)
  const originalShipping=usePurchaseShipping({...artwork,type:'ORIGINAL'},destination)
  const artworkPrice = artwork.base_price_mxn || artwork.calculated_price_mxn || 0
  // Presentación comercial compartida (catálogo, ficha y Home deciden igual)
  const commerce = getArtworkCommercePresentation(artwork)
  const [editionInventory, setEditionInventory] = useState<{id: string; counts: any} | null>(null)
  useEffect(() => {
    if (!isPhysicalLimited || !artwork?.id) return
    let active = true
    const refresh = () => {
      void supabase.rpc('physical_edition_counts', { _artwork_id: artwork.id })
        .then(({ data, error }) => { if (active) setEditionInventory({ id: artwork.id, counts: error ? null : data }) })
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('jbu:edition-inventory-changed', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('jbu:edition-inventory-changed', refresh)
    }
  }, [isPhysicalLimited, artwork?.id])
  const editionCounts = editionInventory && editionInventory.id === artwork.id ? editionInventory.counts : null
  const editionState = editionAvailability(editionCounts)
  const canBuyEdition = ['available', 'limited'].includes(editionState) && commerce.showPrice &&
    artwork.status === 'AVAILABLE' && !exclusivePayment && isArtworkPurchasable(artwork) &&
    itemAvailableInCountry(artwork, destination) && originalShipping.loaded &&
    (!originalShipping.error || originalShipping.error === 'shipping_destination_required')

  const soldUniqueOriginal = isSold && !isPhysicalLimited
  const variants = artwork.artwork_prints || []
  const legacyPrintType = String(artwork.print_type || '').toUpperCase()
  const legacyPrintAvailable = !variants.length && !artwork.has_managed_prints && !destination &&
    Number(artwork.print_price_mxn) > 0 && (!['LIMITED', 'LIMITADA'].includes(legacyPrintType) ||
      Number(artwork.prints_sold || 0) < Number(artwork.print_edition_size || 0))
  const hasPurchasablePrint = artwork.allows_prints && (legacyPrintAvailable ||
    variants.some((variant: any) => isPurchasablePrintVariant(variant) && itemAvailableInCountry(variant, destination)))
  const promotePrints = soldUniqueOriginal && hasPurchasablePrint
  const printsHref = artworkPrintHref(artwork.sku, { country: params.get('country') || destination })

  const [selectedDiscussion, selectDiscussion] = useState<{ kind: string; ref: string } | null>(null)
  const linkedDiscussion = parseDiscussion(params.get('discussion'))
  const discussion = commentsEnabled ? selectedDiscussion || linkedDiscussion : null
  const discussionTitle = lang === 'en' ? artwork.title_en || artwork.title : artwork.title
  function closeDiscussion() {
    selectDiscussion(null)
    clearDiscussionDestination()
  }

  const galleryDiscussion = discussion && mediaItems.find(item => item.discussion && discussionKey(item.discussion) === discussionKey(discussion))
  const provenanceEvent = discussion && (artwork.provenance_events || []).find((event: any) => discussion.kind === 'event'
    ? event.id === discussion.ref : discussion.kind === 'provenance' && event.images?.some((image: any) => image.id === discussion.ref))
  const provenanceDiscussion = discussion?.kind === 'event' ? provenanceEvent?.primary_image_url :
    provenanceEvent?.images?.find((image: any) => image.id === discussion?.ref)?.image_url
  const discussionPrint = discussion?.kind === 'print' && variants.find((variant: any) => variant.id === discussion.ref)
  const discussionImage = galleryDiscussion?.url || provenanceDiscussion ||
    (discussionPrint && printGalleryImages(discussionPrint.gallery_images,
      discussionPrint.resolved_print_image_url || artwork.print_media?.firstFlagged || artwork.original_image_url, lang)[0]?.url) ||
    (discussion?.kind === 'artwork' ? mediaItems.find(item => item.type === 'image')?.url : undefined)

  function renderPhotoDiscussion(image: { discussion: { kind: string; ref: string }; alt?: string }) {
    return <DiscussionPanel artworkId={artwork.id} user={user} context={image.discussion}
      title={discussionTitle} label={image.alt} />
  }


  const isOriginalInCart = cart?.some((item: any) => item.id === artwork.id && item.type === 'ORIGINAL')

  const handleAddOriginalToCart = async () => {
    if (isOriginalInCart || !isOriginalAvailable || addingOriginal) return
    setAddingOriginal(true)
    try {
      await addToCart({
        id: artwork.id,
        type: 'ORIGINAL',
        title: artwork.title,
        price: artworkPrice
      })
    } finally {
      setAddingOriginal(false)
    }
  }

  const [archiveImage, setArchiveImage] = useState<{ url: string; alt: string; discussion?: { kind: string; ref: string } } | null>(null)
  // Procedencia: orden cronológico (antiguo → reciente); la creación siempre abre la historia.
  const provenance = [...(artwork.provenance_events || [])].sort((a: any, b: any) => {
    const ca = a.event_type === 'CREATED' ? 0 : 1, cb = b.event_type === 'CREATED' ? 0 : 1
    if (ca !== cb) return ca - cb
    return String(a.created_at || '').localeCompare(String(b.created_at || ''))
  })
  const formatProvDate = (evt: any) => {
    const d = evt.event_date ? String(evt.event_date) : ''
    if (/^\d{4}$/.test(d)) return d
    if (/^\d{4}-\d{2}$/.test(d)) return new Date(`${d}-15T12:00:00Z`).toLocaleDateString(t('es-MX', 'en-US'), { month: 'long', year: 'numeric', timeZone: 'UTC' })
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString(t('es-MX', 'en-US'), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    return d || (evt.created_at ? new Date(evt.created_at).getFullYear().toString() : '')
  }
  const provBadge = (type: string) => ({
    ARTWORK_VERSION: t('Versión de la obra', 'Artwork version'),
    AUCTION_LOT_ADDED: t('Subasta', 'Auction'), AUCTION_OPENED: t('Subasta', 'Auction'), AUCTION_ENDED: t('Subasta', 'Auction'),
    SOLD: t('Adquisición', 'Acquisition'), CERTIFICATE_ISSUED: t('Certificado', 'Certificate'),
    EXHIBITION: t('Exposición', 'Exhibition'), PUBLICATION: t('Publicación', 'Publication'),
    RESTORATION: t('Conservación', 'Conservation'), MATERIAL_UPDATE: t('Material', 'Material'), FRAMING_UPDATE: t('Enmarcado', 'Framing')
  } as Record<string, string>)[type]

  const formatImgSrc = (url: string) => {
    if (!url) return ARTWORK_PLACEHOLDER
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return url.startsWith('/') ? url : `/${url}`
  }


  const claimUrl = `/claim?sku=${encodeURIComponent((artwork.sku || '').toUpperCase())}`
  const loginToClaimUrl = `/login?redirect=${encodeURIComponent(claimUrl)}`

  // Evita leer window durante el render inicial SSR/hidratación.
  const [currentPath, setCurrentPath] = useState(`/artwork/${artwork.sku || ''}`)
  useEffect(() => {
    setCurrentPath(`${window.location.pathname}${window.location.search}`)
  }, [])

  const handleToggleFavorite = async () => {
    if (favoriteBusy) return
    setFavoriteError('')

    if (!user?.id) {
      router.push(`/login?next=${encodeURIComponent(safeRedirectPath(currentPath, currentPath))}`)
      return
    }

    setFavoriteBusy(true)
    const nextValue = !isFavorite
    setIsFavorite(nextValue)
    setFavoritesCount((prev) => Math.max(0, prev + (nextValue ? 1 : -1)))

    try {
      if (nextValue) {
        const { error } = await supabase
          .from('artwork_favorites')
          .insert({ user_id: user.id, artwork_id: artwork.id })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('artwork_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('artwork_id', artwork.id)
        if (error) throw error
      }
    } catch (error: any) {
      setIsFavorite(!nextValue)
      setFavoritesCount((prev) => Math.max(0, prev + (nextValue ? -1 : 1)))
      setFavoriteError(
        t('No se pudo actualizar tus favoritos. Inténtalo de nuevo.', 'We could not update your favorites. Please try again.')
      )
    } finally {
      setFavoriteBusy(false)
    }
  }

  const auctionPanel = (
    <div id="auction-panel"><AuctionEventContext auction={auction} /><AuctionPanel initialAuction={auction} artwork={artwork} user={user} payment={payment?.source==='AUCTION'?payment:null} onAuctionChange={setAuction} /></div>
  )
  const relatedArtworks = (
    seriesArtworks.length > 0 && (
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.sectionLabel}>{t(`Más de la colección ${seriesName}`, `More from the ${seriesName} collection`)}</h2>
          <Link href="/catalog" style={{ fontSize: '0.75rem' }}>{t('Ver catálogo', 'View catalog')}</Link>
        </div>

        <div className={styles.relatedGrid}>
          {seriesArtworks.map((item) => (
            <Link key={item.id} href={`/artwork/${item.sku || item.id}`} className={styles.seriesCard}>
              <div className={styles.seriesThumb}>
                <OptimizedImg
                  src={formatImgSrc(item.primary_image_url)}
                  alt={localized(item, 'title')}
                  variant="thumbnail"
                  sizes="200px"
                />
              </div>
              <p className={styles.seriesTitle}>{localized(item, 'title')}</p>
              <p className={styles.seriesPrice}>{getAvailability(item) === 'SOLD' ? t('VENDIDO', 'SOLD') : publicStatusLabel(item, t)}</p>
            </Link>
          ))}
        </div>
      </section>
    )
  )
  const artworkInformation = (
    <div className={styles.information}>
      {/* Ficha técnica */}
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.sectionLabel}>{t('Ficha técnica', 'Technical sheet')}</h2>
          <Tag type="cool-gray" size="sm">{artwork.sku}</Tag>
        </div>

        <div className={styles.specs}>
          {localized(artwork, 'medium') && (
            <div className={styles.specRow}>
              <span className={styles.specKey}>{t('Técnica', 'Technique')}</span>
              <span className={styles.specValue}>{localized(artwork, 'medium')}</span>
            </div>
          )}
          {artwork.dimensions && (
            <div className={styles.specRow}>
              <span className={styles.specKey}>{t('Dimensiones', 'Dimensions')}</span>
              <span className={styles.specValue}>{artwork.dimensions}{inches ? <><br />{inches}</> : null}</span>
            </div>
          )}
          {artwork.year && (
            <div className={styles.specRow}>
              <span className={styles.specKey}>{t('Año', 'Year')}</span>
              <span className={styles.specValue}>{artwork.year}</span>
            </div>
          )}
          {artwork.series && (
            <div className={styles.specRow}>
              <span className={styles.specKey}>{t('Colección', 'Collection')}</span>
              <span className={styles.specValue}>{seriesName}</span>
            </div>
          )}
        </div>

        {localized(artwork, 'description') && (
          <div style={{ marginTop: '1.25rem' }}>
            <p className={styles.sectionLabel} style={{ marginBottom: '0.5rem' }}>{t('Acerca de', 'About')}</p>
            <p className={styles.description}>{localized(artwork, 'description')}</p>
          </div>
        )}
      </section>


    </div>
  )
  const artworkHistory = (
    <div className={styles.history}>
      {!!artwork.version_family?.length && (
        <section id="artwork-versions" className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.sectionLabel}>{t('Versiones de la obra', 'Artwork versions')}</h2>
          </div>
          <div className={styles.seriesStrip}>
            {artwork.version_family.filter((row: any) => row.id !== artwork.id).map((row: any) => {
              const label = t(row.title, row.title_en || row.title)
              const parent = artwork.version_family.find((entry: any) => entry.id === row.version_parent_id)
              const path = `/artwork/${encodeURIComponent(row.sku)}`
              return <article key={row.id} className={styles.seriesCard}>
                <Link href={path}>
                  <div className={styles.seriesThumb}>
                    <OptimizedImg src={formatImgSrc(row.primary_image_url)} alt={label} variant="thumbnail" sizes="200px" />
                  </div>
                  <p className={styles.seriesTitle}>{label}</p>
                </Link>
                <Tag size="sm" type={row.is_historical_version ? 'gray' : 'purple'}>
                  {row.is_historical_version ? t('Versión anterior', 'Earlier version') : t('Versión actual', 'Current version')}
                </Tag>
                {parent && <p className={styles.seriesPrice}>{t('Deriva de', 'Derived from')} {t(parent.title, parent.title_en || parent.title)}</p>}
                {row.allows_prints && <Link href={artworkPrintHref(row.sku, { country: destination })}>{t('Ver prints', 'View prints')}</Link>}
              </article>
            })}
          </div>
        </section>
      )}

      {/* Proveniencia */}
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.sectionLabel}>{t('Proveniencia y evolución', 'Provenance and evolution')}</h2>
          <Tag type="cool-gray" size="sm">{t('Archivo Estudio JBU', 'Estudio JBU Archive')}</Tag>
        </div>

        <div className={styles.timeline}>
          {provenance.length > 0 ? (
            provenance.map((evt: any, idx: number) => (
              <div key={evt.id || idx} className={styles.timelineItem}>
                <span
                  className={`${styles.timelineDot} ${
                    ['RESIN_FINISH', 'CREATED', 'MATERIAL_UPDATE'].includes(evt.event_type)
                      ? styles.dotPurple
                      : evt.event_type === 'SOLD'
                        ? styles.dotSuccess
                        : ''
                  }`}
                />
                <div>
                  <p className={styles.timelineDate}>{formatProvDate(evt)}{provBadge(evt.event_type) ? <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>· {provBadge(evt.event_type)}</span> : null}</p>
                  <p className={styles.timelineTitle}>{evt.title}</p>
                  <p className={styles.timelineText}>{evt.description}</p>
                </div>

                {(() => {
                  // Cada imagen histórica se muestra directamente. No dependemos de
                  // un contact-sheet dinámico que puede fallar con varias imágenes.
                  const images = Array.isArray(evt.images) && evt.images.length
                    ? evt.images.filter((item: any) => item.image_url)
                    : (evt.primary_image_url ? [{ id: evt.id, image_url: evt.primary_image_url, event: true }] : [])
                  return images.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {images.map((image: { id?: string, image_url: string, event?: boolean }, imageIndex: number) => (
                        <div key={image.id || image.image_url}>
                          <button
                            type="button"
                            className={styles.timelineThumb}
                            onClick={() => setArchiveImage({ url: image.image_url, alt: evt.title,
                              discussion: image.id ? { kind: image.event ? 'event' : 'provenance', ref: image.id } : undefined })}
                            aria-label={t(`Ampliar imagen ${imageIndex + 1} de ${evt.title}`, `Enlarge image ${imageIndex + 1} of ${evt.title}`)}
                          >
                            <img src={formatImgSrc(image.image_url)} alt={`${evt.title} — ${imageIndex + 1}`} loading="lazy" />
                            <span className={styles.timelineThumbOverlay}><Maximize size={16} /></span>
                          </button>
                          {commentsEnabled && image.id && <DiscussionButton onClick={() => selectDiscussion({
                            kind: image.event ? 'event' : 'provenance', ref: image.id || '',
                          })}>{t('Comentar imagen', 'Discuss image')}</DiscussionButton>}
                        </div>
                      ))}
                    </div>
                  ) : null
                })()}
              </div>
            ))
          ) : (
            <div className={styles.timelineItem}>
              <span className={`${styles.timelineDot} ${styles.dotPurple}`} />
              <div>
                <p className={styles.timelineDate}>{artwork.year || ''}</p>
                <p className={styles.timelineTitle}>{t('Registrada en el archivo JBU', 'Registered in the JBU archive')}</p>
                <p className={styles.timelineText}>
                  {[(lang === 'en' && artwork.medium_en) || artwork.medium, artwork.dimensions].filter(Boolean).join(' · ') || (isPhysicalLimited ? t('Edición física del Estudio JBU.', 'Physical edition from the JBU Studio.') : t('Obra original del Estudio JBU.', 'Original work from the JBU Studio.'))}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
  const communityContent = (
    <>
      {/* Comunidad */}
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.sectionLabel}>{t('Impulso comunitario', 'Community boost')}</h2>
        </div>

        <div className={styles.communityGrid}>
          <div>
          <TierProgressBar
            impactScore={artwork?.artwork_metrics?.impact_score || artwork?.impact_score || 0}
            calculatedPriceMxn={isSold ? undefined : artwork?.calculated_price_mxn}
            basePriceMxn={isSold ? undefined : artwork?.base_price_mxn}
          />

          </div>
          <div>
          <PointBoostWidget
            artworkId={artwork.id}
            artworkSku={artwork.sku}
            currentUserId={user?.id || null}
          />

          </div>
          <div className={styles.communityLeaderboard}><TopBoosters artworkId={artwork.id} /></div>
        </div>
      </section>

    </>
  )
  const registrationContent = !isPhysicalLimited && <ArtworkQR sku={artwork.sku} title={discussionTitle} />
  const ownershipContent = !isPhysicalLimited && (
      <section className={styles.block}>
        <span className={styles.claimTitle}>{t('¿Ya posees esta pieza?', 'Do you already own this piece?')}</span>
        <p className={styles.claimText}>
          {t('Ingresa tu código único de reclamación para asociar el certificado digital de autenticidad a tu colección.', 'Enter your unique claim code to link the digital certificate of authenticity to your collection.')}
        </p>

        {loadingAuth ? (
          <div style={{ height: '2.5rem' }} />
        ) : user ? (
          <Button
            className={styles.fullButton}
            as={Link as any}
            href={claimUrl}
            kind="tertiary"
            renderIcon={ArrowRight}
          >
            {t('Reclamar titularidad', 'Claim ownership')}
          </Button>
        ) : (
          <Button
            className={styles.fullButton}
            as={Link as any}
            href={loginToClaimUrl}
            kind="tertiary"
            renderIcon={Launch}
          >
            {t('Inicia sesión para reclamar', 'Sign in to claim')}
          </Button>
        )}
      </section>
  )

  return (
    <div className={styles.page}>
      {showIntro && (
        <ArtworkVideoReveal
          src={introVideo?.image_url || null}
          poster={introVideo?.poster_url || null}
          title={artwork?.title || ''}
          waiting={!mediaLoaded}
          onDone={() => setShowIntro(false)}
        />
      )}
      <div className={styles.inner}>

        <div className={styles.backRow}>
          <Breadcrumb noTrailingSlash>
            <BreadcrumbItem href="/">{t('Galería', 'Gallery')}</BreadcrumbItem>
            <BreadcrumbItem href={destination ? `/catalog?country=${destination}` : '/catalog'}>{t('Catálogo', 'Catalog')}</BreadcrumbItem>
            {artwork.series && (
              <BreadcrumbItem href={`/catalog?series=${encodeURIComponent(artwork.series)}${destination ? '&country=' + destination : ''}`}>
                {seriesName}
              </BreadcrumbItem>
            )}
            <BreadcrumbItem isCurrentPage>{artwork.title}</BreadcrumbItem>
          </Breadcrumb>
        </div>

        <div className={styles.layout}>

          {/* ============ IZQUIERDA: galería y ficha ============ */}
          <div className={styles.heroGallery}>
            <MediaGallery
              items={mediaItems}
              onDiscuss={commentsEnabled ? selectDiscussion : undefined}
              onOpen={(idx: number) => { setLightboxIndex(idx); setIsLightboxOpen(true) }}
            />


          </div>

          {/* ============ DERECHA: compra y comunidad ============ */}
          <aside className={styles.buyColumn}>

            <div className={styles.titleBlock}>
              <div className={styles.tagRow}>
                <div className={styles.tags}>
                  {artwork.series && <Tag type="purple" size="md">{t(`Colección ${seriesName}`, `${seriesName} Collection`)}</Tag>}
                  <Tag type={isPhysicalLimited ? 'purple' : isOriginalAvailable ? 'green' : 'gray'} size="md">
                    {isPhysicalLimited
                      ? t('Edición física limitada', 'Physical Limited Edition')
                      : isSold ? t('VENDIDO', 'SOLD') : publicStatusLabel(artwork, t)}
                  </Tag>
                </div>

              </div>

              <h1 className={styles.title}>{lang === 'en' ? artwork.title_en || artwork.title : artwork.title}</h1>
              {isPhysicalLimited && <p className={styles.meta}>{[social?.presentation?.artist || artwork.artist || 'Josué Beltrán Uresti', seriesName].filter(Boolean).join(' · ')}</p>}
              <p className={styles.meta}>
                {artwork.sku}{artwork.year ? ` · ${artwork.year}` : ''}{!isPhysicalLimited && artwork.dimensions ? ` · ${artwork.dimensions}` : ''}{!isPhysicalLimited && inches ? ` (${inches})` : ''}
              </p>

              <div className={styles.statsRow} aria-label={t('Estadísticas de la obra', 'Artwork stats')}>
                <span className={styles.statPill}>
                  <View size={16} />
                  {viewsCount.toLocaleString(locale)} {t('vistas', 'views')}
                </span>
                <span className={styles.statPill}>
                  {isFavorite ? <FavoriteFilled size={16} /> : <Favorite size={16} />}
                  {favoritesCount.toLocaleString(locale)} {t('favoritos', 'favorites')}
                </span>
              </div>

              {favoriteError && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title={t('Favoritos', 'Favorites')}
                  subtitle={favoriteError}
                  style={{ marginTop: '0.75rem' }}
                />
              )}
            </div>

            {paymentError&&<InlineNotification kind="error" lowContrast hideCloseButton title={t('Pago pendiente','Payment pending')} subtitle={paymentError}/>}
            {payment?.source==='OFFER'&&<PendingPayment payment={payment} userId={user?.id} now={now} busy={paymentBusy} onPay={pay}/>}
            {!promotePrints && (showAuction ? auctionPanel : (
            <section className={styles.purchase}>
              <span className={styles.priceLabel}>
                {isPhysicalLimited ? editionDesignation(artwork.physical_edition_size, t) : t('Original única', 'One-of-a-kind original')}
              </span>
              {isPhysicalLimited && <PhysicalEditionAvailability counts={editionCounts}
                size={artwork.physical_edition_size} loading={editionInventory?.id !== artwork.id} />}
              {isSold && !isPhysicalLimited ? <p className={styles.sectionLabel}>{t('VENDIDO', 'SOLD')}</p> : commerce.showPrice ? (
                <>
                  <span className={styles.price}>
                    {displayPrice(commerce.price ?? 0).amount}<span className={styles.priceCurrency}>{displayPrice(commerce.price ?? 0).currency}</span>
                  </span>
                  {displayPrice(commerce.price ?? 0).approximate && <ExchangeNote />}
                </>
              ) : null}
              {destination&&!itemAvailableInCountry(artwork,destination)&&<p role="status" className={styles.priceNote}>{t('Esta obra no está disponible para el país seleccionado.','This artwork is unavailable in the selected country.')}</p>}

              {isPhysicalLimited && (
                <div className={styles.buttonRow}><PhysicalEditionBuyButton artworkId={artwork.id} disabled={!canBuyEdition} /></div>
              )}

              {isOriginalAvailable && commerce.showAdd && !originalShipping.error && <div className={styles.buttonRow}>
                <Button
                  className={styles.fullButton}
                  kind="tertiary"
                  renderIcon={isOriginalInCart ? Checkmark : ShoppingCart}
                  onClick={handleAddOriginalToCart}
                  disabled={!isOriginalAvailable || !originalShipping.loaded || addingOriginal || isOriginalInCart}
                >
                  {addingOriginal
                    ? t('Agregando...', 'Adding...')
                    : isOriginalInCart
                      ? t('En la bolsa', 'In bag')
                      : !isOriginalAvailable
                        ? t('No disponible', 'Not available')
                        : t('Agregar al carrito', 'Add to cart')}
                </Button>

                <BuyButton
                  artworkId={artwork.id}
                  sku={artwork.sku}
                  title={artwork.title}
                  image={artwork.primary_image_url}
                  price={commerce.price ?? undefined}
                  status={currentStatus}
                  className={styles.fullButton}
                  buyNow direct disabled={!originalShipping.loaded}
                />
              </div>}

              {isOriginalAvailable && commerce.showInquiry && (
                <div className={styles.buttonRow}>
                  <AskForPriceButton
                    artwork={artwork}
                    settings={siteSettings}
                    kind="primary"
                    className={styles.fullButton}
                  />
                </div>
              )}

              {isOriginalAvailable&&commerce.showAdd&&!isPhysicalLimited&&<LocalDeliveryInfo artwork={artwork} user={user} settings={siteSettings}/>}

              {isPhysicalLimited
                ? <PhysicalEditionSpecifications artwork={artwork} destination={destination} siteSettings={siteSettings} />
                : !soldUniqueOriginal && <PurchaseBenefits item={{...artwork,type:'ORIGINAL'}} destination={destination} artwork={artwork} settings={siteSettings}/>}
            </section>
            ))}

            {hasPurchasablePrint && (
              <section id="prints" className={styles.printInvitation}>
                {promotePrints && <p className={styles.meta}>{t('Original único · Vendido', 'Unique Original · Sold')}</p>}
                <Button as={Link as any} href={printsHref} kind={promotePrints ? 'primary' : 'ghost'} renderIcon={ArrowRight}>
                  {t('Explorar Fine Art Prints', 'Explore Fine Art Prints')}
                </Button>
              </section>
            )}
            <div className={styles.quickActions}>
                  <Button
                    hasIconOnly
                    renderIcon={isFavorite ? FavoriteFilled : Favorite}
                    iconDescription={isFavorite ? t('Quitar de favoritos', 'Remove from favorites') : t('Guardar en favoritos', 'Save to favorites')}
                    tooltipPosition="bottom"
                    kind="ghost"
                    size="md"
                    disabled={favoriteBusy}
                    onClick={handleToggleFavorite}
                  />
                  {acceptsOffers && isOriginalAvailable && <Button
                    hasIconOnly
                    renderIcon={TagEdit}
                    iconDescription={t('Hacer una oferta', 'Make an offer')}
                    tooltipPosition="bottom"
                    kind="ghost"
                    size="md"
                    onClick={() => setIsOfferModalOpen(true)}
                  />}
                  <ArtworkShare
                    social={social}
                    iconOnly
                    artworkId={artwork.id}
                    sku={artwork.sku}
                    title={artwork.title}
                    description={artwork.description}
                    image={artwork.primary_image_url}
                    price={commerce.price ?? undefined}
                    available={isOriginalAvailable}
                  />
                </div>
            {commentsEnabled && <div>
              <DiscussionButton onClick={() => selectDiscussion(ARTWORK_DISCUSSION)}>
                {t('Comentar la obra', 'Discuss the artwork')}
              </DiscussionButton>
            </div>}
          </aside>
        </div>
        <div className={styles.editorialRow}>
          {artworkInformation}
          {artworkHistory}
        </div>
        {(seriesArtworks.length > 0 || !isPhysicalLimited) && <div className={`${styles.editorialRow} ${styles.relatedContent}`}>
          {relatedArtworks}
          {registrationContent}
        </div>}
        {promotePrints && showAuction && auctionPanel}
        {communityContent}
        <div className={styles.ownership}>{ownershipContent}</div>
      </div>

      {/* La barra fija de compra antigua se retiró: las acciones de compra
          vigentes ya se muestran en la ficha. Conservamos el acceso a subastas. */}
      {showAuction && (
        <div className={styles.mobileBar}>
          <AuctionMobileBar auction={auction} onAction={() => document.getElementById('auction-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        </div>
      )}

      <ArtworkLightbox isOpen={Boolean(archiveImage)} onClose={() => setArchiveImage(null)}
        images={archiveImage ? [archiveImage] : []} artworkTitle={archiveImage?.alt || discussionTitle}
        renderDiscussion={commentsEnabled ? renderPhotoDiscussion : undefined} canDiscuss={image => Boolean(image.discussion)} />
      <ArtworkDiscussionModal artworkId={artwork.id} user={user} context={discussion} title={discussionTitle}
        image={discussionImage} label={provenanceEvent?.title || discussionPrint?.size} onClose={closeDiscussion} />

      <ArtworkLightbox
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        images={mediaItems}
        currentIndex={lightboxIndex}
        onSelectIndex={setLightboxIndex}
        renderDiscussion={commentsEnabled ? renderPhotoDiscussion : undefined}
        canDiscuss={image => Boolean(image.discussion)}
        artworkTitle={discussionTitle}
      />

      {acceptsOffers && <MakeOfferModal
        isOpen={isOfferModalOpen}
        onClose={() => setIsOfferModalOpen(false)}
        artwork={artwork}
        currentUser={user}
      />}
    </div>
  )
}
