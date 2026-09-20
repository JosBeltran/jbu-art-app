'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Grid,
  Column,
  Button,
  Tag,
  Select,
  SelectItem,
  Modal,
  Tile,
  Stack
} from '@carbon/react'
import {
  ShoppingCart,
  Checkmark,
  Launch,
  ArrowRight,
  Maximize,
  Flash,
  Favorite,
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

interface ArtworkDetailClientProps {
  artwork: any
}

export default function ArtworkDetailClient({ artwork }: ArtworkDetailClientProps) {
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [addingOriginal, setAddingOriginal] = useState(false)
  const [addingPrint, setAddingPrint] = useState(false)
  const [buyingNow, setBuyingNow] = useState(false)
  
  // Estado para favoritos (corazón)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false)

  // Estados para Galería ampliada (Lightbox) y series
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

  // Consolidar todas las imágenes antes de declarar activeImage
  const allGalleryImages = useMemo(() => {
    return [
      artwork.primary_image_url,
      ...(artwork.secondary_images || []),
      ...additionalImages
    ].filter(Boolean)
  }, [artwork, additionalImages])

  const [activeImage, setActiveImage] = useState<string>(allGalleryImages[0] || '')

  // Sincronizar imagen activa si cambia el arreglo general
  useEffect(() => {
    if (allGalleryImages.length > 0 && (!activeImage || !allGalleryImages.includes(activeImage))) {
      setActiveImage(allGalleryImages[0])
    }
  }, [allGalleryImages, activeImage])

  // Consultar imágenes adicionales de la base de datos y obras de la misma serie
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

  const claimUrl = `/claim?sku=${encodeURIComponent((artwork.sku || '').toUpperCase())}`
  const loginToClaimUrl = `/login?redirect=${encodeURIComponent(claimUrl)}`

  return (
    <div className="cds--theme--g100" style={{ minHeight: '100vh', width: '100%', backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}>
      {/* Contenedor principal con el Grid oficial de Carbon */}
      <Grid className="cds--grid--full-width" style={{ maxWidth: '1400px', margin: '0 auto', paddingTop: '2rem', paddingBottom: '3rem' }}>
        
        {/* ========================================================= */}
        {/* COLUMNA IZQUIERDA: Galería (Miniaturas + Principal + Serie) */}
        {/* ========================================================= */}
        <Column sm={4} md={8} lg={8} xlg={8}>
          <Stack gap={6}>
            
            {/* Visor de Galería en bloque rígido y contenido */}
            <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)', padding: '1rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', width: '100%', boxSizing: 'border-box' }}>
                
                {/* Columna de Miniaturas Verticales */}
                {allGalleryImages.length > 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '4.5rem', flexShrink: 0, maxHeight: '500px', overflowY: 'auto' }}>
                    {allGalleryImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImage(img)}
                        style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '1/1',
                          border: activeImage === img ? '2px solid var(--cds-interactive-01)' : '1px solid var(--cds-border-subtle01)',
                          padding: 0,
                          background: 'none',
                          cursor: 'pointer',
                          opacity: activeImage === img ? 1 : 0.6,
                          borderRadius: '2px',
                          overflow: 'hidden',
                          flexShrink: 0
                        }}
                      >
                        <img 
                          src={formatImgSrc(img)} 
                          alt={`Vista ${idx + 1}`} 
                          onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg' }}
                          style={{ objectFit: 'cover', width: '100%', height: '100%', display: 'block' }}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Contenedor Imagen Principal (Fija en proporción para evitar desbordes) */}
                <div 
                  onClick={() => {
                    const currentIdx = allGalleryImages.indexOf(activeImage)
                    setLightboxIndex(currentIdx !== -1 ? currentIdx : 0)
                    setIsLightboxOpen(true)
                  }}
                  style={{ 
                    flex: 1, 
                    minWidth: 0,
                    aspectRatio: '1/1', 
                    position: 'relative', 
                    overflow: 'hidden', 
                    backgroundColor: 'var(--cds-layer-02)', 
                    cursor: 'zoom-in',
                    borderRadius: '4px',
                    border: '1px solid var(--cds-border-subtle01)'
                  }}
                  title="Haz clic para ver en pantalla completa"
                >
                  <img 
                    src={formatImgSrc(activeImage)} 
                    alt={artwork.title}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg' }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{ position: 'absolute', bottom: '12px', right: '12px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Maximize size={16} /> Ampliar
                  </div>
                </div>
              </div>

              {/* Fila Inferior de la Serie (Contenida sin desbordamiento) */}
              {seriesArtworks.length > 0 && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--cds-border-subtle01)' }}>
                  <span className="cds--label" style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                    Más de la Colección {artwork.series}
                  </span>
                  
                  <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                    {seriesArtworks.map((item) => (
                      <Link 
                        key={item.id} 
                        href={`/artwork/${item.sku || item.id}`}
                        style={{ textDecoration: 'none', display: 'block', width: '100px', flexShrink: 0 }}
                      >
                        <div style={{ width: '100px', height: '100px', backgroundColor: 'var(--cds-layer-02)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.25rem', border: '1px solid var(--cds-border-subtle01)' }}>
                          <img 
                            src={formatImgSrc(item.primary_image_url)} 
                            alt={item.title} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        </div>
                        <p style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--cds-text-primary)', margin: '0 0 2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0 }}>
                          ${Number(item.base_price_mxn || 0).toLocaleString('es-MX')}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Tile>

            {/* Ficha Técnica y Descripción */}
            <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)' }}>
              <Stack gap={4}>
                <div>
                  <span className="cds--label" style={{ display: 'block', marginBottom: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                    Ficha Técnica
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--cds-border-subtle01)' }}>
                    <span style={{ color: 'var(--cds-text-secondary)' }}>Técnica:</span>
                    <span style={{ fontWeight: '600', color: 'var(--cds-text-primary)' }}>{artwork.medium}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', paddingTop: '0.5rem' }}>
                    <span style={{ color: 'var(--cds-text-secondary)' }}>Dimensiones:</span>
                    <span style={{ fontWeight: '600', color: 'var(--cds-text-primary)' }}>{artwork.dimensions}</span>
                  </div>
                </div>

                {artwork.description && (
                  <div>
                    <span className="cds--label" style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--cds-text-secondary)' }}>
                      Sobre la obra
                    </span>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)', lineHeight: '1.5', margin: 0 }}>
                      {artwork.description}
                    </p>
                  </div>
                )}
              </Stack>
            </Tile>

            {/* Registro de Proveniencia */}
            <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--cds-border-subtle01)' }}>
                <span className="cds--label" style={{ color: 'var(--cds-text-secondary)' }}>
                  Registro de Proveniencia & Evolución
                </span>
                <Tag type="cool-gray" size="sm">
                  Archivo Estudio JBU
                </Tag>
              </div>

              <div style={{ position: 'relative', borderLeft: '2px solid var(--cds-border-strong01)', marginLeft: '1rem', marginTop: '1.5rem', paddingLeft: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {provenance.length > 0 ? (
                  provenance.map((evt: any, idx: number) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute',
                        left: '-31px',
                        top: '4px',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        outline: '4px solid var(--cds-layer-01)',
                        backgroundColor: evt.event_type === 'RESIN_FINISH' ? 'var(--cds-support-purple)' : evt.event_type === 'SOLD' ? 'var(--cds-support-success)' : 'var(--cds-text-secondary)'
                      }} />
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <div>
                          <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--cds-text-secondary)', margin: 0 }}>{evt.event_date || '2026'}</p>
                          <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--cds-text-primary)', margin: '0.25rem 0' }}>{evt.title}</p>
                          <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', margin: 0 }}>{evt.description}</p>
                        </div>

                        {evt.primary_image_url && (
                          <button 
                            onClick={() => setModalImage(evt.primary_image_url)}
                            style={{ position: 'relative', flexShrink: 0, width: '3.5rem', height: '3.5rem', border: '1px solid var(--cds-border-subtle01)', background: 'none', cursor: 'pointer', padding: 0, overflow: 'hidden' }}
                          >
                            <img 
                              src={formatImgSrc(evt.primary_image_url)} 
                              alt={evt.title} 
                              style={{ objectFit: 'cover', width: '100%', height: '100%', display: 'block' }}
                            />
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                              <Maximize size={16} />
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '-31px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', outline: '4px solid var(--cds-layer-01)', backgroundColor: 'var(--cds-support-purple)' }} />
                      <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--cds-text-secondary)', margin: 0 }}>{artwork.year || '2026'}</p>
                      <p style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--cds-text-primary)', margin: '0.25rem 0' }}>Estudio JBU • Sello de Resina Epóxica</p>
                      <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', margin: 0 }}>
                        Finalización de capas mixtas y encapsulado técnico protector de la superficie.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Tile>

          </Stack>
        </Column>

        {/* ========================================================= */}
        {/* COLUMNA DERECHA: Título, Compra, Prints y Comunidad        */}
        {/* ========================================================= */}
        <Column sm={4} md={8} lg={8} xlg={8}>
          <Stack gap={6}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Tag type="purple" size="md">
                    Colección {artwork.series}
                  </Tag>
                  <Tag type={isOriginalAvailable ? 'green' : 'gray'} size="md">
                    {isOriginalAvailable ? 'OBRA ORIGINAL DISPONIBLE' : 'COLECCIÓN PRIVADA'}
                  </Tag>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    hasIconOnly
                    renderIcon={Favorite}
                    iconDescription={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    kind={isFavorite ? 'primary' : 'tertiary'}
                    size="field"
                    onClick={() => setIsFavorite(!isFavorite)}
                    style={{ border: '1px solid var(--cds-border-subtle01)' }}
                  />
                  <Button
                    hasIconOnly
                    renderIcon={TagEdit}
                    iconDescription="Hacer una oferta por esta obra"
                    kind="tertiary"
                    size="field"
                    onClick={() => setIsOfferModalOpen(true)}
                    style={{ border: '1px solid var(--cds-border-subtle01)' }}
                  />
                </div>
              </div>

              <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--cds-text-primary)', margin: 0 }}>
                {artwork.title}
              </h1>
              <p className="cds--type-label" style={{ color: 'var(--cds-text-secondary)', margin: 0, textTransform: 'uppercase' }}>
                SKU: {artwork.sku} • {artwork.year}
              </p>
            </div>

            {/* MÓDULO A: Obra Original */}
            <Tile style={{ backgroundColor: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle01)', borderLeft: '4px solid var(--cds-interactive-01)', padding: '1.5rem' }}>
              <Stack gap={3}>
                <div>
                  <span className="cds--label" style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--cds-text-secondary)' }}>
                    Obra Original Única
                  </span>
                  <span style={{ fontSize: '1.75rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>
                    ${Number(artworkPrice).toLocaleString('es-MX')} MXN
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <Button
                      kind={isOriginalInCart ? 'success' : 'secondary'}
                      renderIcon={isOriginalInCart ? Checkmark : ShoppingCart}
                      onClick={handleAddOriginalToCart}
                      disabled={!isOriginalAvailable || addingOriginal || isOriginalInCart}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {addingOriginal ? 'Agregando...' : isOriginalInCart ? 'En la bolsa' : !isOriginalAvailable ? 'No disponible' : 'Añadir a la bolsa'}
                    </Button>
                  </div>

                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <Button
                      kind="primary"
                      renderIcon={Flash}
                      onClick={handleBuyNowOriginal}
                      disabled={!isOriginalAvailable || buyingNow}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {buyingNow ? 'Procesando...' : 'Comprar ahora'}
                    </Button>
                  </div>
                </div>
              </Stack>
            </Tile>

            {/* MÓDULO B: Fine Art Prints */}
            {allowsPrints && (
              <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)' }}>
                <Stack gap={4}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Stack gap={1}>
                      <Tag type={isPrintLimited ? 'magenta' : 'blue'} size="sm">
                        {isPrintLimited ? `Edición Limitada (${printsSold}/${printEditionSize})` : 'Edición Abierta'}
                      </Tag>
                      <h3 style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--cds-text-primary)', margin: 0 }}>
                        Fine Art Print ({printMaterial})
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0 }}>
                        {printSize ? `Dimensiones: ${printSize} • ` : ''}Impresión de alta fidelidad.
                      </p>
                    </Stack>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>
                        ${Number(printPrice).toLocaleString('es-MX')} MXN
                      </span>
                    </div>
                  </div>

                  {printOptions.length > 1 && (
                    <Select
                      id="print-variant-select"
                      labelText="Seleccionar Tamaño / Acabado"
                      value={selectedPrintIndex}
                      onChange={(e) => setSelectedPrintIndex(Number(e.target.value))}
                      size="sm"
                    >
                      {printOptions.map((opt: any, i: number) => (
                        <SelectItem
                          key={opt.id || i}
                          value={i}
                          text={`${opt.size || opt.dimensions || 'Estándar'} - ${opt.finish || opt.material || 'Canvas'} ($${Number(opt.price_mxn || opt.price || 0).toLocaleString('es-MX')} MXN)`}
                        />
                      ))}
                    </Select>
                  )}

                  <Button
                    kind={isPrintInCart ? 'success' : 'tertiary'}
                    renderIcon={isPrintInCart ? Checkmark : ShoppingCart}
                    onClick={handleAddPrintToCart}
                    disabled={isPrintSoldOut || addingPrint || isPrintInCart || printPrice === 0}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    {addingPrint ? 'Agregando Print...' : isPrintInCart ? 'Print en el Carrito' : isPrintSoldOut ? 'Edición Agotada' : printPrice === 0 ? 'Opción No Disponible' : `Agregar Print — $${Number(printPrice).toLocaleString('es-MX')} MXN`}
                  </Button>
                </Stack>
              </Tile>
            )}

            {/* SECCIÓN DE COMUNIDAD */}
            <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)' }}>
              <Stack gap={5}>
                <span className="cds--label" style={{ color: 'var(--cds-text-secondary)' }}>
                  Impulso Comunitario & Valor Dinámico
                </span>
                
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
              </Stack>
            </Tile>

            {/* VERIFICACIÓN Y RECLAMACIÓN */}
            <Stack gap={4}>
              <ArtworkQR sku={artwork.sku} title={artwork.title} />

              <Tile style={{ backgroundColor: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle01)' }}>
                <Stack gap={3}>
                  <div>
                    <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--cds-text-primary)', display: 'block', marginBottom: '0.25rem' }}>
                      ¿Posees esta pieza en tu colección?
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: 0, lineHeight: '1.4' }}>
                      Ingresa tu código único de reclamación para asociar formalmente el Certificado Digital de Autenticidad.
                    </p>
                  </div>

                  {loadingAuth ? (
                    <div style={{ height: '2rem' }} />
                  ) : user ? (
                    <Button
                      as={Link as any}
                      href={claimUrl}
                      kind="tertiary"
                      size="sm"
                      renderIcon={ArrowRight}
                      style={{ width: '100%', justifyContent: 'space-between' }}
                    >
                      Reclamar Titularidad de esta Obra
                    </Button>
                  ) : (
                    <Button
                      as={Link as any}
                      href={loginToClaimUrl}
                      kind="ghost"
                      size="sm"
                      renderIcon={Launch}
                      style={{ width: '100%', justifyContent: 'space-between', border: '1px solid var(--cds-border-subtle01)' }}
                    >
                      Inicia Sesión para Reclamar Obra
                    </Button>
                  )}
                </Stack>
              </Tile>
            </Stack>

          </Stack>
        </Column>
      </Grid>

      {/* MODAL ARCHIVO HISTÓRICO */}
      <Modal
        open={Boolean(modalImage)}
        modalHeading="Registro de Archivo"
        passiveModal
        onRequestClose={() => setModalImage(null)}
        size="lg"
      >
        {modalImage && (
          <div style={{ padding: '1rem', textAlign: 'center' }}>
            <img 
              src={formatImgSrc(modalImage)} 
              alt="Registro de proceso creativo anterior" 
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/placeholder.jpg' }}
              style={{ width: '100%', height: 'auto', maxHeight: '70vh', objectFit: 'contain', marginBottom: '0.75rem', display: 'block', marginInline: 'auto' }}
            />
            <p className="cds--type-caption" style={{ color: 'var(--cds-text-secondary)', margin: 0 }}>
              Estado previo de la obra — Archivo Estudio JBU
            </p>
          </div>
        )}
      </Modal>

      {/* MODAL LIGHTBOX EN PANTALLA COMPLETA */}
      <ArtworkLightbox 
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        images={allGalleryImages}
        currentIndex={lightboxIndex}
        onSelectIndex={setLightboxIndex}
        artworkTitle={artwork.title}
        seriesArtworks={seriesArtworks}
        onSelectSeriesArtwork={(selectedArt: any) => {
          setIsLightboxOpen(false)
          router.push(`/artwork/${selectedArt.sku || selectedArt.id}`)
        }}
      />

      {/* Modal de "Make an Offer" */}
      <MakeOfferModal 
        isOpen={isOfferModalOpen}
        onClose={() => setIsOfferModalOpen(false)}
        artwork={artwork}
      />
    </div>
  )
}