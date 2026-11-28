'use client'
import { useCookieConsent } from '@/components/consent/CookieConsent'
import { allowsAnalytics } from '@/lib/cookieConsent'
import { isArtworkPurchasable, getAvailability, publicStatusLabel } from '@/lib/artworkStatus'
import { useMarket } from '@/components/market/MarketProvider'
import ArtworkInformationTabs from '@/components/ArtworkInformationTabs'
import PurchaseBenefits from '@/components/purchase/PurchaseBenefits'
import LocalDeliveryInfo from '@/components/purchase/LocalDeliveryInfo'
import { usePurchaseShipping } from '@/components/shipping/usePurchaseShipping'
import { browsingCountry } from '@/lib/market'
import { itemAvailableInCountry } from '@/lib/countryAvailability'

import { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Button,
  Tag,
  Breadcrumb,
  BreadcrumbItem,
  StructuredListWrapper, StructuredListBody, StructuredListRow, StructuredListCell,
  Accordion, AccordionItem, Tile, Pagination,
  InlineNotification
} from '@carbon/react'
import {
  ShoppingCart,
  Checkmark,
  Launch,
  ArrowRight,
  Maximize,
  TagEdit
} from '@carbon/icons-react'

import { supabase } from '@/lib/supabaseClient'
import { getArtworks } from '@/lib/artworks'
import { ARTWORK_PLACEHOLDER, handleArtworkImageError } from '@/lib/artworkPlaceholder'
import OptimizedImg from '@/components/media/OptimizedImg'
import ArtworkShare from '@/components/share/ArtworkShare'
import { relatedPublicArtworkVersions } from '@/lib/artworkDetailPresentation'
import BuyButton from '@/components/BuyButton'
import AskForPriceButton from '@/components/AskForPriceButton'
import { getArtworkCommercePresentation } from '@/lib/artworkCommerce'
import { useCart } from '@/context/CartContext'
import TierProgressBar from '@/components/TierProgressBar'
import PointBoostWidget from '@/components/PointBoostWidget'
import TopBoosters from '@/components/TopBoosters'
import MakeOfferModal from '@/components/MakeOfferModal'
import PendingPayment from '@/components/auction/PendingPayment'
import { shippingErrorText } from '@/lib/shippingCountries'
import {fetchPayment,payPending} from '@/lib/payments/pending.client'
import AuctionPanel from '@/components/auction/AuctionPanel'
import PhysicalEditionAvailability from '@/components/PhysicalEditionAvailability'
import PhysicalEditionSpecifications from '@/components/PhysicalEditionSpecifications'
import { isPhysicalEdition, editionAvailability, editionDesignation } from '@/lib/physicalEdition'
import PhysicalEditionBuyButton from '@/components/PhysicalEditionBuyButton'
import AuctionEventContext from '@/components/auction/AuctionEventContext'
import { fetchArtworkAuction } from '@/lib/auctions'
import ArtworkLightbox from '@/components/ArtworkLightbox'
import MediaGallery from '@/components/media/MediaGallery'
import ArtworkVideoReveal from '@/components/media/ArtworkVideoReveal'
import { buildArtworkMedia } from '@/lib/artworkMedia'
import { useI18n, useLocalized } from '@/components/I18nProvider'
import { localizedSeriesName } from '@/lib/seriesContent'
import { DiscussionButton } from '@/components/comments/ArtworkDiscussion'
import ArtworkDiscussionModal, { DiscussionPanel } from '@/components/comments/ArtworkDiscussionModal'
import { artworkPrintHref } from '@/lib/printRoutes'
import { printGalleryImages } from '@/lib/printGallery'
import { clearDiscussionDestination, discussionKey, parseDiscussion } from '@/lib/artworkDiscussion'
import { useCurrency, ExchangeNote } from '@/components/CurrencyProvider'
import WallSpaceLauncher from '@/components/prints/space/WallSpaceLauncher'
import { originalWallGeometry } from '@/lib/productCatalog/wallSpace'
import { inchesFromCmText } from '@/lib/dimensions'
import styles from './ArtworkDetail.module.css'

interface ArtworkDetailClientProps {
  artwork: any
  commentsEnabled?: boolean
  country?: string | null
  printCountries?: string[]
  siteSettings?: any
  social?: { config: object; presentation: { title: string; artist: string; description: string; domain: string }; version: string; titleEn: string } | null
}


export default function ArtworkDetailClient({ artwork, siteSettings = null, social = null, printCountries = [], country = null, commentsEnabled = false }: ArtworkDetailClientProps) {
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

  // Cada obra decide explícitamente si recibe ofertas; sin el permiso no se muestra nada de ofertas
  const acceptsOffers = artwork?.accepts_offers === true
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
  const [relatedPage,setRelatedPage] = useState(1)
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
    async function registerView() {
      if (!artwork?.id || typeof window === 'undefined' || !allowsAnalytics()) return
      const sessionKey = `jbu:viewed-artwork:${artwork.id}`
      try {
        if (window.sessionStorage.getItem(sessionKey)) return
        window.sessionStorage.setItem(sessionKey, '1')
      } catch {
        /* sessionStorage no disponible */
      }
      await supabase.rpc('increment_artwork_view', {
        target_artwork_id: artwork.id
      })
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
  const versions = relatedPublicArtworkVersions(artwork)
  const hasPublicPrints = printCountries.length > 0 && (!destination || printCountries.includes(destination))
  const secondaryActions = <div className={styles.secondaryActions}>
    <ArtworkShare artworkId={artwork.id} sku={artwork.sku} title={artwork.title} social={social} />
    {hasPublicPrints && <Button as={Link} kind="ghost" size="sm" renderIcon={ArrowRight}
      href={artworkPrintHref(artwork.sku,{country:destination})}>
      {t('Explorar Fine Art Prints','Explore Fine Art Prints')}
    </Button>}
  </div>
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

  const auctionPanel = (
    <div id="auction-panel"><AuctionEventContext auction={auction} /><AuctionPanel initialAuction={auction} artwork={artwork} user={user} payment={payment?.source==='AUCTION'?payment:null} onAuctionChange={setAuction} /></div>
  )
  const relatedArtworks = (
    seriesArtworks.length > 0 && (
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.sectionLabel}>{t(`Más de la colección ${seriesName}`, `More from ${seriesName}`)}</h2>
          <Link href="/catalog" style={{ fontSize: '0.75rem' }}>{t('Ver catálogo', 'View catalog')}</Link>
        </div>

        <div className={styles.relatedGrid}>
          {seriesArtworks.slice((relatedPage-1)*4,relatedPage*4).map((item) => (
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
        {seriesArtworks.length>4 && <Pagination page={relatedPage} pageSize={4} pageSizes={[4]} totalItems={seriesArtworks.length}
          onChange={({page})=>setRelatedPage(page)} pageSizeInputDisabled
          backwardText={t('Obras anteriores','Previous artworks')} forwardText={t('Más obras','More artworks')}
          itemsPerPageText={t('Obras por página:','Artworks per page:')}
          itemRangeText={(min,max,total)=>`${min}–${max} ${t('de','of')} ${total}`}
          pageRangeText={(_current,total)=>`${t('de','of')} ${total} ${t('páginas','pages')}`} />}
      </section>
    )
  )
  const artworkInformation = (
    <section id="details" className={styles.detailsGrid}>
      <div className={styles.narrative}>
        <h2 className={styles.sectionLabel}>{t('Acerca de la obra','About the Artwork')}</h2>
        {localized(artwork, 'description') && <p className={styles.description}>{localized(artwork, 'description')}</p>}
      </div>
      <div>
      <h2 className={styles.sectionLabel}>{t('Ficha técnica','Technical Specifications')}</h2>
      <StructuredListWrapper isCondensed isFlush aria-label={t('Ficha técnica','Technical specifications')}>
        <StructuredListBody>
          {[
            [t('Técnica','Technique'), localized(artwork,'medium')],
            [t('Dimensiones','Dimensions'), artwork.dimensions ? artwork.dimensions + (inches ? ` (${inches})` : '') : null],
            [t('Año','Year'), artwork.year],
            [t('Colección','Collection'), seriesName],
          ].filter(([,value])=>value).map(([label,value])=><StructuredListRow key={label}>
            <StructuredListCell>{label}</StructuredListCell><StructuredListCell>{value}</StructuredListCell>
          </StructuredListRow>)}
        </StructuredListBody>
      </StructuredListWrapper>
      </div>
    </section>
  )
  const artworkHistory = (
    <div id="artwork-provenance" className={styles.history}>
      {/* Proveniencia */}
      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className={styles.sectionLabel}>{t('Proveniencia y evolución', 'Provenance & Evolution')}</h2>
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
  const artworkVersions = <div className={styles.artworkVersions}>
      {versions.length > 0 && (
        <section id="artwork-versions" className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className={styles.sectionLabel}>{t('Versiones de la obra', 'Artwork Versions')}</h2>
          </div>
          <div className={styles.versionList}>
            {versions.map((row: any) => {
              const label = t(row.title, row.title_en || row.title)
              const parent = row.version_parent_id === artwork.id ? artwork : versions.find((entry: {id: string; title: string; title_en?: string}) => entry.id === row.version_parent_id)
              const path = `/artwork/${encodeURIComponent(row.sku)}`
              return <article key={row.id} className={styles.seriesCard}>
                <Link href={path}>
                  <div className={styles.seriesThumb}>
                    <OptimizedImg src={formatImgSrc(row.primary_image_url)} alt={label} variant="thumbnail" sizes="200px" />
                  </div>
                  <p className={styles.seriesTitle}>{label}</p>
                  {row.year && <p className={styles.seriesPrice}>{row.year}</p>}
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

  </div>
  const communityContent = (
    <>
      {/* Comunidad */}
      <section className={styles.block}>
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
          <Accordion className={styles.communityLeaderboard}>
            <AccordionItem title={t('Top impulsores de esta pieza','Top boosters of this piece')}>
              <TopBoosters artworkId={artwork.id} />
            </AccordionItem>
          </Accordion>
        </div>
      </section>

    </>
  )
  const ownershipContent = !isPhysicalLimited && (
      <Tile className={styles.claimBanner}>
        <div>
        <h2 className={styles.claimTitle}>{t('¿Ya posees esta pieza?', 'Already own this artwork?')}</h2>
        <p className={styles.claimText}>
          {t('Asocia el certificado digital de autenticidad a tu colección y registra tu propiedad.', 'Link the digital Certificate of Authenticity to your collection and register your ownership.')}
        </p>

        </div>
        {loadingAuth ? (
          <div style={{ height: '2.5rem' }} />
        ) : user ? (
          <Button
            className={styles.claimButton}
            as={Link as any}
            href={claimUrl}
            kind="tertiary"
            renderIcon={ArrowRight}
          >
            {t('Reclamar titularidad', 'Claim ownership')}
          </Button>
        ) : (
          <Button
            className={styles.claimButton}
            as={Link as any}
            href={loginToClaimUrl}
            kind="tertiary"
            renderIcon={Launch}
          >
            {t('Inicia sesión para reclamar', 'Sign in to claim')}
          </Button>
        )}
      </Tile>
  )

  const spaceGeometry = ['AVAILABLE','OWNED'].includes(artwork.status) && !artwork.is_historical_version &&
    (artwork.version_kind !== 'SUCCESSOR' || artwork.version_published_at) ? originalWallGeometry(artwork.dimensions) : null
  const spaceImage = artwork.original_image_url || artwork.primary_image_url
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
              layout="editorial"
              activeDiscussion={discussion}
              onDiscuss={commentsEnabled ? selectDiscussion : undefined}
              onOpen={(idx: number) => { setLightboxIndex(idx); setIsLightboxOpen(true) }}
            />
            {spaceGeometry && spaceImage && <WallSpaceLauncher country={destination}
              initial={{artworkId:artwork.id,title:artwork.title,titleEn:artwork.title_en,image:formatImgSrc(spaceImage),geometry:spaceGeometry}} />}


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
              <p className={styles.meta}>
                {[localized(artwork,'medium'), artwork.dimensions ? artwork.dimensions + (inches ? ` (${inches})` : '') : null, artwork.year].filter(Boolean).join(' · ')}
              </p>

            </div>

            {paymentError&&<InlineNotification kind="error" lowContrast hideCloseButton title={t('Pago pendiente','Payment pending')} subtitle={paymentError}/>}
            {payment?.source==='OFFER'&&<PendingPayment payment={payment} userId={user?.id} now={now} busy={paymentBusy} onPay={pay}/>}
            {showAuction ? <>{auctionPanel}{secondaryActions}</> : (
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

              {secondaryActions}
              {acceptsOffers && isOriginalAvailable && <Button kind="ghost" size="sm" renderIcon={TagEdit}
                onClick={() => setIsOfferModalOpen(true)}>{t('Hacer una oferta','Make an offer')}</Button>}

              {isOriginalAvailable&&commerce.showAdd&&!isPhysicalLimited&&<LocalDeliveryInfo artwork={artwork} user={user} settings={siteSettings}/>}

              {isPhysicalLimited
                ? <PhysicalEditionSpecifications artwork={artwork} destination={destination} siteSettings={siteSettings} />
                : !soldUniqueOriginal && <PurchaseBenefits item={{...artwork,type:'ORIGINAL'}} destination={destination} artwork={artwork} settings={siteSettings}/>}
            </section>
            )}

          </aside>
        </div>
        {artworkInformation}
        {(seriesArtworks.length > 0 || !isPhysicalLimited) && <div className={styles.relatedOwnership}>
          {relatedArtworks}
          {ownershipContent}
        </div>}
        <ArtworkInformationTabs
          provenance={<div className={`${styles.provenanceGrid} ${!versions.length ? styles.provenanceFull : ''}`}>{artworkHistory}{versions.length > 0 && artworkVersions}</div>}
          community={communityContent} />
      </div>

      <ArtworkLightbox watermark isOpen={Boolean(archiveImage)} onClose={() => setArchiveImage(null)}
        images={archiveImage ? [archiveImage] : []} artworkTitle={archiveImage?.alt || discussionTitle}
        renderDiscussion={commentsEnabled ? renderPhotoDiscussion : undefined} canDiscuss={image => Boolean(image.discussion)} />
      <ArtworkDiscussionModal artworkId={artwork.id} user={user} context={discussion} title={discussionTitle}
        image={discussionImage} label={provenanceEvent?.title || discussionPrint?.size} onClose={closeDiscussion} />

      <ArtworkLightbox
        watermark
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
