'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Button,
  Tag,
  Select,
  SelectItem,
  Modal,
  Breadcrumb,
  BreadcrumbItem
} from '@carbon/react'
import {
  ShoppingCart,
  Checkmark,
  Launch,
  ArrowRight,
  Maximize,
  Flash,
  Favorite,
  FavoriteFilled,
  TagEdit
} from '@carbon/icons-react'

import { supabase } from '@/lib/supabaseClient'
import ArtworkQR from '@/components/ArtworkQR'
import { useCart } from '@/context/CartContext'
import TierProgressBar from '@/components/TierProgressBar'
import PointBoostWidget from '@/components/PointBoostWidget'
import TopBoosters from '@/components/TopBoosters'
import MakeOfferModal from '@/components/MakeOfferModal'
import ArtworkLightbox from '@/components/ArtworkLightbox'
import { useI18n } from '@/components/I18nProvider'
import styles from './ArtworkDetail.module.css'

interface ArtworkDetailClientProps {
  artwork: any
}

const money = (value: number, locale: string = 'es-MX') => `$${Number(value || 0).toLocaleString(locale)}`

export default function ArtworkDetailClient({ artwork }: ArtworkDetailClientProps) {
  const router = useRouter()
  const { t, locale } = useI18n()

  const [user, setUser] = useState<any>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [addingOriginal, setAddingOriginal] = useState(false)
  const [addingPrint, setAddingPrint] = useState(false)
  const [buyingNow, setBuyingNow] = useState(false)

  const [isFavorite, setIsFavorite] = useState(false)
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false)

  const [additionalImages, setAdditionalImages] = useState<string[]>([])
  const [seriesArtworks, setSeriesArtworks] = useState<any[]>([])
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
  }, [])

  const allGalleryImages = useMemo(() => {
    return [
      artwork.primary_image_url,
      ...(artwork.secondary_images || []),
      ...additionalImages
    ].filter(Boolean)
  }, [artwork, additionalImages])

  const [activeImage, setActiveImage] = useState<string>(allGalleryImages[0] || '')

  useEffect(() => {
    if (allGalleryImages.length > 0 && (!activeImage || !allGalleryImages.includes(activeImage))) {
      setActiveImage(allGalleryImages[0])
    }
  }, [allGalleryImages, activeImage])

  useEffect(() => {
    async function fetchGalleryData() {
      if (!artwork?.id) return

      const { data: imagesData } = await supabase
        .from('artwork_images')
        .select('*')
        .eq('artwork_id', artwork.id)
        .order('display_order', { ascending: true })

      if (imagesData && imagesData.length > 0) {
        setAdditionalImages(imagesData.map((img: any) => img.image_url))
      }

      if (artwork?.series) {
        const { data: seriesData } = await supabase
          .from('artworks')
          .select('id, title, primary_image_url, base_price_mxn, sku')
          .eq('series', artwork.series)
          .neq('id', artwork.id)
          .limit(6)

        if (seriesData) {
          setSeriesArtworks(seriesData)
        }
      }

    }
    fetchGalleryData()
  }, [artwork?.id, artwork?.series])

  const currentStatus = artwork.ownership_status || artwork.status || 'AVAILABLE'
  const isOriginalAvailable = currentStatus === 'AVAILABLE'
  const artworkPrice = artwork.base_price_mxn || artwork.calculated_price_mxn || 0

  const printOptions = useMemo(() => {
    return artwork?.print_options || artwork?.artwork_prints || artwork?.prints || []
  }, [artwork])

  const [selectedPrintIndex, setSelectedPrintIndex] = useState(0)
  const selectedPrint = printOptions[selectedPrintIndex] || null

  const allowsPrints = Boolean(
    (artwork?.allows_prints ?? artwork?.allow_prints ?? artwork?.has_prints ?? false) &&
    (printOptions.length > 0 || (artwork?.print_price_mxn && artwork?.print_price_mxn > 0))
  )

  const printPrice = Number(
    selectedPrint?.price_mxn ??
    selectedPrint?.price ??
    artwork?.print_price_mxn ??
    artwork?.print_price ??
    0
  )

  const printType = (selectedPrint?.edition_type || selectedPrint?.print_type || artwork?.print_type || 'OPEN').toUpperCase()
  const isPrintLimited = printType === 'LIMITED' || printType === 'LIMITADA'

  const printsSold = Number(selectedPrint?.prints_sold ?? artwork?.prints_sold ?? 0)
  const printEditionSize = Number(
    selectedPrint?.edition_size ??
    selectedPrint?.print_limit ??
    artwork?.print_edition_size ??
    artwork?.print_limit ??
    0
  )

  const printMaterial = selectedPrint?.finish || selectedPrint?.material || 'Lienzo / Canvas'
  const printSize = selectedPrint?.size || selectedPrint?.dimensions || ''
  const isPrintSoldOut = isPrintLimited && printEditionSize > 0 && printsSold >= printEditionSize

  const isOriginalInCart = cart?.some((item: any) => item.id === artwork.id && item.type === 'ORIGINAL')
  const isPrintInCart = cart?.some(
    (item: any) => item.id === artwork.id && item.type === 'PRINT' && (selectedPrint ? item.variantId === selectedPrint.id : true)
  )

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

  const handleBuyNowOriginal = async () => {
    if (!isOriginalAvailable || buyingNow) return
    setBuyingNow(true)
    try {
      if (!isOriginalInCart) {
        await addToCart({
          id: artwork.id,
          type: 'ORIGINAL',
          title: artwork.title,
          price: artworkPrice
        })
      }
      router.push('/checkout')
    } catch (error) {
      console.error('Error al procesar compra directa:', error)
    } finally {
      setBuyingNow(false)
    }
  }

  const handleAddPrintToCart = async () => {
    if (isPrintInCart || isPrintSoldOut || addingPrint || printPrice === 0) return
    setAddingPrint(true)
    try {
      await addToCart({
        id: artwork.id,
        type: 'PRINT',
        variantId: selectedPrint?.id,
        title: `${artwork.title} (Print - ${printMaterial}${printSize ? ` ${printSize}` : ''})`,
        price: printPrice,
        size: printSize,
        finish: printMaterial
      })
    } finally {
      setAddingPrint(false)
    }
  }

  const [modalImage, setModalImage] = useState<string | null>(null)
  const provenance = artwork.provenance_events || []

  const formatImgSrc = (url: string) => {
    if (!url) return '/placeholder.jpg'
    if (url.startsWith('http://') || url.startsWith('https://')) return url
    return url.startsWith('/') ? url : `/${url}`
  }

  const openLightbox = () => {
    const currentIdx = allGalleryImages.indexOf(activeImage)
    setLightboxIndex(currentIdx !== -1 ? currentIdx : 0)
    setIsLightboxOpen(true)
  }

  const claimUrl = `/claim?sku=${encodeURIComponent((artwork.sku || '').toUpperCase())}`
  const loginToClaimUrl = `/login?redirect=${encodeURIComponent(claimUrl)}`

  return (
    <div className={styles.page}>
      <div className={styles.inner}>

        <div className={styles.backRow}>
          <Breadcrumb noTrailingSlash>
            <BreadcrumbItem href="/">{t('Galería', 'Gallery')}</BreadcrumbItem>
            <BreadcrumbItem href="/catalog">{t('Catálogo', 'Catalog')}</BreadcrumbItem>
            {artwork.series && (
              <BreadcrumbItem href={`/catalog?serie=${encodeURIComponent(artwork.series)}`}>
                {artwork.series}
              </BreadcrumbItem>
            )}
            <BreadcrumbItem isCurrentPage>{artwork.title}</BreadcrumbItem>
          </Breadcrumb>
        </div>

        <div className={styles.layout}>

          {/* ============ IZQUIERDA: galería y ficha ============ */}
          <div>
            <div className={`${styles.gallery} ${allGalleryImages.length > 1 ? '' : styles.galleryNoThumbs}`}>
              {allGalleryImages.length > 1 && (
                <div className={styles.thumbs}>
                  {allGalleryImages.map((img, idx) => (
                    <button
                      type="button"
                      key={`${img}-${idx}`}
                      onClick={() => setActiveImage(img)}
                      aria-label={t(`Ver imagen ${idx + 1} de ${artwork.title}`, `View image ${idx + 1} of ${artwork.title}`)}
                      aria-pressed={activeImage === img}
                      className={`${styles.thumb} ${activeImage === img ? styles.thumbActive : ''}`}
                    >
                      <img
                        src={formatImgSrc(img)}
                        alt={t(`Vista ${idx + 1}`, `View ${idx + 1}`)}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg' }}
                      />
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                className={styles.stage}
                onClick={openLightbox}
                aria-label={t('Ampliar imagen de la obra', 'Enlarge artwork image')}
              >
                <img
                  src={formatImgSrc(activeImage)}
                  alt={artwork.title}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg' }}
                />
                <span className={styles.zoomHint}>
                  <Maximize size={16} /> {t('Ampliar', 'Enlarge')}
                </span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>

              {/* Ficha técnica */}
              <section className={styles.block}>
                <div className={styles.blockHead}>
                  <p className={styles.sectionLabel}>{t('Ficha técnica', 'Technical sheet')}</p>
                  <Tag type="cool-gray" size="sm">{artwork.sku}</Tag>
                </div>

                <div className={styles.specs}>
                  {artwork.medium && (
                    <div className={styles.specRow}>
                      <span className={styles.specKey}>{t('Técnica', 'Technique')}</span>
                      <span className={styles.specValue}>{artwork.medium}</span>
                    </div>
                  )}
                  {artwork.dimensions && (
                    <div className={styles.specRow}>
                      <span className={styles.specKey}>{t('Dimensiones', 'Dimensions')}</span>
                      <span className={styles.specValue}>{artwork.dimensions}</span>
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
                      <span className={styles.specValue}>{artwork.series}</span>
                    </div>
                  )}
                </div>

                {artwork.description && (
                  <div style={{ marginTop: '1.25rem' }}>
                    <p className={styles.sectionLabel} style={{ marginBottom: '0.5rem' }}>{t('Sobre la obra', 'About the artwork')}</p>
                    <p className={styles.description}>{artwork.description}</p>
                  </div>
                )}
              </section>

              {/* Más de la colección */}
              {seriesArtworks.length > 0 && (
                <section className={styles.block}>
                  <div className={styles.blockHead}>
                    <p className={styles.sectionLabel}>{t(`Más de la colección ${artwork.series}`, `More from the ${artwork.series} collection`)}</p>
                    <Link href="/catalog" style={{ fontSize: '0.75rem' }}>{t('Ver catálogo', 'View catalog')}</Link>
                  </div>

                  <div className={styles.seriesStrip}>
                    {seriesArtworks.map((item) => (
                      <Link key={item.id} href={`/artwork/${item.sku || item.id}`} className={styles.seriesCard}>
                        <div className={styles.seriesThumb}>
                          <img
                            src={formatImgSrc(item.primary_image_url)}
                            alt={item.title}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg' }}
                          />
                        </div>
                        <p className={styles.seriesTitle}>{item.title}</p>
                        <p className={styles.seriesPrice}>{money(item.base_price_mxn, locale)} MXN</p>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {/* Proveniencia */}
              <section className={styles.block}>
                <div className={styles.blockHead}>
                  <p className={styles.sectionLabel}>{t('Proveniencia y evolución', 'Provenance and evolution')}</p>
                  <Tag type="cool-gray" size="sm">{t('Archivo Estudio JBU', 'Estudio JBU Archive')}</Tag>
                </div>

                <div className={styles.timeline}>
                  {provenance.length > 0 ? (
                    provenance.map((evt: any, idx: number) => (
                      <div key={idx} className={styles.timelineItem}>
                        <span
                          className={`${styles.timelineDot} ${
                            evt.event_type === 'RESIN_FINISH'
                              ? styles.dotPurple
                              : evt.event_type === 'SOLD'
                                ? styles.dotSuccess
                                : ''
                          }`}
                        />
                        <div>
                          <p className={styles.timelineDate}>{evt.event_date || artwork.year || '2026'}</p>
                          <p className={styles.timelineTitle}>{evt.title}</p>
                          <p className={styles.timelineText}>{evt.description}</p>
                        </div>

                        {evt.primary_image_url && (
                          <button
                            type="button"
                            className={styles.timelineThumb}
                            onClick={() => setModalImage(evt.primary_image_url)}
                            aria-label={t(`Ampliar registro: ${evt.title}`, `Enlarge record: ${evt.title}`)}
                          >
                            <img src={formatImgSrc(evt.primary_image_url)} alt={evt.title} />
                            <span className={styles.timelineThumbOverlay}><Maximize size={16} /></span>
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className={styles.timelineItem}>
                      <span className={`${styles.timelineDot} ${styles.dotPurple}`} />
                      <div>
                        <p className={styles.timelineDate}>{artwork.year || '2026'}</p>
                        <p className={styles.timelineTitle}>{t('Estudio JBU • Sello de resina epóxica', 'Estudio JBU • Epoxy resin seal')}</p>
                        <p className={styles.timelineText}>
                          {t('Finalización de capas mixtas y encapsulado técnico protector de la superficie.', 'Completion of mixed layers and technical protective surface encapsulation.')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* ============ DERECHA: compra y comunidad ============ */}
          <aside className={styles.buyColumn}>

            <div className={styles.titleBlock}>
              <div className={styles.tagRow}>
                <div className={styles.tags}>
                  {artwork.series && <Tag type="purple" size="md">{t(`Colección ${artwork.series}`, `${artwork.series} Collection`)}</Tag>}
                  <Tag type={isOriginalAvailable ? 'green' : 'gray'} size="md">
                    {isOriginalAvailable ? t('Original disponible', 'Original available') : t('Colección privada', 'Private collection')}
                  </Tag>
                </div>

                <div className={styles.quickActions}>
                  <Button
                    hasIconOnly
                    renderIcon={isFavorite ? FavoriteFilled : Favorite}
                    iconDescription={isFavorite ? t('Quitar de favoritos', 'Remove from favorites') : t('Guardar en favoritos', 'Save to favorites')}
                    tooltipPosition="bottom"
                    kind="ghost"
                    size="md"
                    onClick={() => setIsFavorite(!isFavorite)}
                  />
                  <Button
                    hasIconOnly
                    renderIcon={TagEdit}
                    iconDescription={t('Hacer una oferta', 'Make an offer')}
                    tooltipPosition="bottom"
                    kind="ghost"
                    size="md"
                    onClick={() => setIsOfferModalOpen(true)}
                  />
                </div>
              </div>

              <h1 className={styles.title}>{artwork.title}</h1>
              <p className={styles.meta}>
                {artwork.sku}{artwork.year ? ` · ${artwork.year}` : ''}{artwork.dimensions ? ` · ${artwork.dimensions}` : ''}
              </p>
            </div>

            {/* Compra de la obra original */}
            <section className={styles.purchase}>
              <span className={styles.priceLabel}>{t('Obra original única', 'One-of-a-kind original artwork')}</span>
              <span className={styles.price}>
                {money(artworkPrice, locale)}<span className={styles.priceCurrency}>MXN</span>
              </span>
              <p className={styles.priceNote}>
                {t('Incluye certificado digital de autenticidad y registro de proveniencia.', 'Includes digital certificate of authenticity and provenance record.')}
              </p>

              <div className={styles.buttonRow}>
                <Button
                  className={styles.fullButton}
                  kind="tertiary"
                  renderIcon={isOriginalInCart ? Checkmark : ShoppingCart}
                  onClick={handleAddOriginalToCart}
                  disabled={!isOriginalAvailable || addingOriginal || isOriginalInCart}
                >
                  {addingOriginal
                    ? t('Agregando...', 'Adding...')
                    : isOriginalInCart
                      ? t('En la bolsa', 'In bag')
                      : !isOriginalAvailable
                        ? t('No disponible', 'Not available')
                        : t('Añadir a la bolsa', 'Add to bag')}
                </Button>

                <Button
                  className={styles.fullButton}
                  kind="primary"
                  renderIcon={Flash}
                  onClick={handleBuyNowOriginal}
                  disabled={!isOriginalAvailable || buyingNow}
                >
                  {buyingNow ? t('Procesando...', 'Processing...') : t('Comprar ahora', 'Buy now')}
                </Button>
              </div>

              <div className={styles.secondaryRow}>
                <Button
                  className={styles.fullButton}
                  kind="ghost"
                  size="sm"
                  renderIcon={TagEdit}
                  onClick={() => setIsOfferModalOpen(true)}
                >
                  {t('Hacer una oferta', 'Make an offer')}
                </Button>
                <Button
                  className={styles.fullButton}
                  kind="ghost"
                  size="sm"
                  renderIcon={isFavorite ? FavoriteFilled : Favorite}
                  onClick={() => setIsFavorite(!isFavorite)}
                >
                  {isFavorite ? t('En favoritos', 'In favorites') : t('Guardar', 'Save')}
                </Button>
              </div>
            </section>

            {/* Fine Art Prints */}
            {allowsPrints && (
              <section className={styles.block}>
                <div className={styles.printHead}>
                  <div>
                    <Tag type={isPrintLimited ? 'magenta' : 'blue'} size="sm">
                      {isPrintLimited ? t(`Edición limitada ${printsSold}/${printEditionSize}`, `Limited edition ${printsSold}/${printEditionSize}`) : t('Edición abierta', 'Open edition')}
                    </Tag>
                    <h2 className={styles.printTitle}>{t('Fine Art Print', 'Fine Art Print')} · {printMaterial}</h2>
                    <p className={styles.printText}>
                      {printSize ? `${printSize} • ` : ''}{t('Impresión de alta fidelidad certificada.', 'Certified high-fidelity print.')}
                    </p>
                  </div>
                  <span className={styles.printPrice}>{money(printPrice, locale)} MXN</span>
                </div>

                {printOptions.length > 1 && (
                  <div className={styles.printSelect}>
                    <Select
                      id="print-variant-select"
                      labelText={t('Tamaño y acabado', 'Size and finish')}
                      value={selectedPrintIndex}
                      onChange={(e: any) => setSelectedPrintIndex(Number(e.target.value))}
                      size="md"
                    >
                      {printOptions.map((opt: any, i: number) => (
                        <SelectItem
                          key={opt.id || i}
                          value={i}
                          text={t(`${opt.size || opt.dimensions || 'Estándar'} · ${opt.finish || opt.material || 'Canvas'} — ${money(opt.price_mxn || opt.price, locale)} MXN`, `${opt.size || opt.dimensions || 'Standard'} · ${opt.finish || opt.material || 'Canvas'} — ${money(opt.price_mxn || opt.price, locale)} MXN`)}
                        />
                      ))}
                    </Select>
                  </div>
                )}

                <Button
                  className={styles.fullButton}
                  kind="tertiary"
                  renderIcon={isPrintInCart ? Checkmark : ShoppingCart}
                  onClick={handleAddPrintToCart}
                  disabled={isPrintSoldOut || addingPrint || isPrintInCart || printPrice === 0}
                >
                  {addingPrint
                    ? t('Agregando print...', 'Adding print...')
                    : isPrintInCart
                      ? t('Print en la bolsa', 'Print in bag')
                      : isPrintSoldOut
                        ? t('Edición agotada', 'Sold out edition')
                        : printPrice === 0
                          ? t('Opción no disponible', 'Option not available')
                          : t(`Agregar print — ${money(printPrice, locale)} MXN`, `Add print — ${money(printPrice, locale)} MXN`)}
                </Button>
              </section>
            )}

            {/* Comunidad */}
            <section className={styles.block}>
              <div className={styles.blockHead}>
                <p className={styles.sectionLabel}>{t('Impulso comunitario', 'Community boost')}</p>
              </div>

              <div className={styles.communityStack}>
                <TierProgressBar
                  impactScore={artwork?.artwork_metrics?.impact_score || artwork?.impact_score || 0}
                  calculatedPriceMxn={artwork?.calculated_price_mxn}
                  basePriceMxn={artwork?.base_price_mxn}
                />

                <PointBoostWidget
                  artworkId={artwork.id}
                  artworkSku={artwork.sku}
                  currentUserId={user?.id || null}
                />

                <TopBoosters artworkId={artwork.id} />
              </div>
            </section>

            {/* Verificación y reclamación */}
            <ArtworkQR sku={artwork.sku} title={artwork.title} />

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
          </aside>
        </div>
      </div>

      {/* Barra fija de compra en móvil */}
      <div className={styles.mobileBar}>
        <div className={styles.mobileBarPrice}>
          <span className={styles.mobileBarLabel}>{t('Obra original', 'Original artwork')}</span>
          <span className={styles.mobileBarValue}>{money(artworkPrice, locale)} MXN</span>
        </div>
        <Button
          className={styles.fullButton}
          kind="primary"
          renderIcon={Flash}
          onClick={handleBuyNowOriginal}
          disabled={!isOriginalAvailable || buyingNow}
        >
          {isOriginalAvailable ? (buyingNow ? t('Procesando...', 'Processing...') : t('Comprar', 'Buy')) : t('No disponible', 'Not available')}
        </Button>
      </div>

      {/* Modal archivo histórico */}
      <Modal
        open={Boolean(modalImage)}
        modalHeading={t('Registro de archivo', 'Archive record')}
        passiveModal
        onRequestClose={() => setModalImage(null)}
        size="lg"
      >
        {modalImage && (
          <div style={{ padding: '1rem' }}>
            <img
              className={styles.modalImage}
              src={formatImgSrc(modalImage)}
              alt={t('Registro de proceso creativo anterior', 'Previous creative process record')}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg' }}
            />
            <p className={styles.modalCaption}>{t('Estado previo de la obra — Archivo Estudio JBU', 'Previous state of the artwork — Estudio JBU Archive')}</p>
          </div>
        )}
      </Modal>

      <ArtworkLightbox
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        images={allGalleryImages}
        currentIndex={lightboxIndex}
        onSelectIndex={setLightboxIndex}
        artworkTitle={artwork.title}
      />

      <MakeOfferModal
        isOpen={isOfferModalOpen}
        onClose={() => setIsOfferModalOpen(false)}
        artwork={artwork}
        currentUser={user}
      />
    </div>
  )
}
