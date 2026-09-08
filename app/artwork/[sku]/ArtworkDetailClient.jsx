'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import ArtworkEngagement from './ArtworkEngagement'
import ArtworkQR from '@/components/ArtworkQR'
import BuyButton from '@/components/BuyButton'
import { useCart } from '@/context/CartContext'

export default function ArtworkDetailClient({ artwork }) {
  // Manejo de usuario / sesión
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [addingToCart, setAddingToCart] = useState(false)

  // Extraemos 'cart' para validar si la obra ya está agregada
  const { addToCart, cart } = useCart()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user || null)
      setLoadingAuth(false)
    }
    checkUser()
  }, [supabase])

  // Rutas dinámicas y precios
  const currentStatus = artwork.ownership_status || artwork.status || 'AVAILABLE'
  const isAvailable = currentStatus === 'AVAILABLE'
  const artworkPrice = artwork.base_price_mxn || artwork.calculated_price_mxn || 0

  // Comprobar si esta obra específica ya está guardada en el carrito global
  const isInCart = cart?.some((item) => item.id === artwork.id)

  // Handler Asíncrono para Agregar al Carrito
  const handleAddToCart = async () => {
    if (isInCart) return // Evita re-enviar la solicitud si ya está en el carrito

    setAddingToCart(true)
    
    const success = await addToCart({
      id: artwork.id,
      type: 'ORIGINAL',
    })

    setAddingToCart(false)

    if (success) {
      // Opcional: Abrir un Drawer/Sidepanel del carrito si tienes un estado global
    }
  }

  // Manejo de impresiones (Prints)
  const prints = artwork.prints_data || []
  const [selectedPrint, setSelectedPrint] = useState(prints[0] || null)

  // Manejo de ventana modal / popup de imágenes de archivo
  const [modalImage, setModalImage] = useState(null)

  // Registro dinámico de eventos de proveniencia desde Supabase
  const provenance = artwork.provenance_events || []

  // Manejo de galería de imágenes
  const galleryImages = [
    artwork.primary_image_url,
    ...(artwork.secondary_images || [])
  ].filter(Boolean)

  const [activeImage, setActiveImage] = useState(galleryImages[0] || '')

  const formatImgSrc = (url) => {
    if (!url) return '/placeholder.jpg'
    return url.startsWith('/') ? url : `/${url}`
  }

  const claimUrl = `/claim?sku=${encodeURIComponent((artwork.sku || '').toUpperCase())}`
  const loginToClaimUrl = `/login?redirect=${encodeURIComponent(claimUrl)}`

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        
        {/* COLUMNA IZQUIERDA: Visor de Galería e Historial de Proveniencia */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Imagen Principal */}
          <div className="space-y-3">
            <div className="relative aspect-square w-full bg-gray-50 rounded-xl overflow-hidden border border-gray-200/80 shadow-sm">
              <img 
                src={formatImgSrc(activeImage)} 
                alt={artwork.title}
                onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
                className="object-cover w-full h-full transition-all duration-300"
              />
            </div>

            {/* Miniaturas de Galería */}
            {galleryImages.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {galleryImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(img)}
                    className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition flex-shrink-0 ${
                      activeImage === img ? 'border-black ring-1 ring-black' : 'border-gray-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img 
                      src={formatImgSrc(img)} 
                      alt="" 
                      onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
                      className="object-cover w-full h-full" 
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sección de Proveniencia e Historial Evolutivo */}
          <div className="border-t border-gray-200 pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Registro de Proveniencia & Evolución
              </h3>
              <span className="text-[10px] bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded">
                Archivo Estudio JBU
              </span>
            </div>

            <div className="relative border-l-2 border-gray-200 ml-3 space-y-6 pl-6 py-2">
              {provenance.length > 0 ? (
                provenance.map((evt, idx) => (
                  <div key={idx} className="relative group">
                    <span className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white ${
                      evt.event_type === 'RESIN_FINISH' 
                        ? 'bg-indigo-600' 
                        : evt.event_type === 'SOLD' 
                        ? 'bg-emerald-600' 
                        : 'bg-gray-400'
                    }`} />
                    
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-0.5">
                        <p className="text-xs font-bold text-gray-900">{evt.event_date || '2026'}</p>
                        <p className="text-sm font-semibold text-gray-800">{evt.title}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{evt.description}</p>
                      </div>

                      {evt.primary_image_url && (
                        <button 
                          onClick={() => setModalImage(evt.primary_image_url)}
                          className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-gray-200 hover:border-black transition shadow-sm group"
                          title="Haz clic para ampliar la versión de archivo"
                        >
                          <img 
                            src={formatImgSrc(evt.primary_image_url)} 
                            alt={evt.title} 
                            onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
                            className="object-cover w-full h-full group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs font-bold">
                            🔍
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="relative">
                    <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                    <p className="text-xs font-bold text-gray-900">{artwork.year || '2026'}</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">Estudio JBU • Sello de Resina Epóxica</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Finalización de capas mixtas y encapsulado técnico protector de la superficie.
                    </p>
                  </div>

                  <div className="relative">
                    <span className="absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full bg-gray-300 ring-4 ring-white" />
                    <p className="text-xs font-bold text-gray-900">Catalogación</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">Colección {artwork.series}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                      Ingreso oficial al catálogo de obras bajo el código {artwork.sku}.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>

        {/* COLUMNA DERECHA: Ficha Técnica, Compras y Métricas */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Encabezado */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase bg-indigo-50 px-2.5 py-1 rounded-md">
                Colección {artwork.series}
              </span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-md tracking-wide ${
                isAvailable 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {isAvailable ? 'OBRA ORIGINAL DISPONIBLE' : 'COLECCIÓN PRIVADA'}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
              {artwork.title}
            </h1>
            <p className="mt-1 text-sm font-medium text-gray-500">
              SKU: {artwork.sku} • {artwork.year}
            </p>
          </div>

          {/* Ficha Técnica */}
          <div className="border-t border-b border-gray-100 py-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Técnica:</span>
              <span className="font-semibold text-gray-900">{artwork.medium}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Dimensiones:</span>
              <span className="font-semibold text-gray-900">{artwork.dimensions}</span>
            </div>
          </div>

          {/* MÓDULO DE VERIFICACIÓN / QR DE LA OBRA */}
          <ArtworkQR sku={artwork.sku} title={artwork.title} />

          {/* Concepto / Descripción de la Obra */}
          {artwork.description && (
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Sobre la obra
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/80 p-4 rounded-xl border border-gray-100">
                {artwork.description}
              </p>
            </div>
          )}

          {/* MÓDULO A: Adquisición de la Obra Original */}
          <div className="p-5 border border-gray-900 rounded-xl bg-gray-900 text-white space-y-4 shadow-md">
            <div className="flex justify-between items-baseline">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold block">
                  Obra Original Única
                </span>
                <span className="text-2xl font-black">
                  ${Number(artworkPrice).toLocaleString('es-MX')} MXN
                </span>
              </div>
            </div>

            {/* BOTÓN CON VALIDACIÓN DE EXISTENCIA EN EL CARRITO */}
            <button
              onClick={handleAddToCart}
              disabled={!isAvailable || addingToCart || isInCart}
              className={`w-full font-bold py-3.5 px-6 rounded-lg text-sm uppercase tracking-wider transition-all ${
                isInCart
                  ? 'bg-emerald-600 text-white cursor-default'
                  : 'bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950'
              }`}
            >
              {addingToCart 
                ? 'Agregando...' 
                : isInCart 
                ? '✓ Obra Agregada al Carrito' 
                : !isAvailable 
                ? 'Obra No Disponible' 
                : `Agregar al Carrito — $${Number(artworkPrice).toLocaleString('es-MX')} MXN`}
            </button>
          </div>

          {/* MÓDULO B: Reclamación de Titularidad (Coleccionistas) */}
          <div className="p-5 border border-amber-200/80 rounded-xl bg-amber-50/40 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                ¿Posees esta pieza en tu colección?
              </h3>
              <p className="text-xs text-amber-900/70 mt-1 leading-relaxed">
                Ingresa tu código único de reclamación (Claim Token) para asociar formalmente el Certificado Digital de Autenticidad a tu cuenta.
              </p>
            </div>

            {loadingAuth ? (
              <div className="text-xs font-mono text-gray-400 py-2 text-center">
                Verificando sesión...
              </div>
            ) : user ? (
              <Link
                href={claimUrl}
                className="flex items-center justify-between w-full bg-amber-500 text-gray-950 px-4 py-3 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-amber-400 transition shadow-sm"
              >
                <span>✨ Reclamar Titularidad de esta Obra</span>
                <span>→</span>
              </Link>
            ) : (
              <Link
                href={loginToClaimUrl}
                className="flex items-center justify-between w-full bg-gray-900 text-amber-400 px-4 py-3 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-gray-800 transition"
              >
                <span>Inicia Sesión para Reclamar Obra</span>
                <span>↗</span>
              </Link>
            )}
          </div>

          {/* MÓDULO C: Selector de Impresiones de Arte (Fine Art Prints) */}
          {prints.length > 0 && (
            <div className="p-5 border border-gray-200 rounded-xl bg-white space-y-4 shadow-sm">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Impresiones de Arte (Fine Art Prints)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Reproducción de alta fidelidad sobre papel de algodón.
                </p>
              </div>

              <div className="space-y-2">
                {prints.map((print, idx) => {
                  const isSelected = selectedPrint?.url === print.url
                  return (
                    <label 
                      key={idx}
                      onClick={() => setSelectedPrint(print)}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition text-xs font-medium ${
                        isSelected 
                          ? 'border-black bg-gray-50 text-gray-900 font-bold' 
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span>{print.label}</span>
                      <input 
                        type="radio" 
                        name="print_option" 
                        checked={isSelected} 
                        onChange={() => setSelectedPrint(print)}
                        className="accent-black"
                      />
                    </label>
                  )
                })}
              </div>

              {selectedPrint && (
                <a 
                  href={selectedPrint.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="flex items-center justify-between w-full bg-black text-white px-4 py-3 rounded-lg font-bold text-xs hover:bg-gray-800 transition"
                >
                  <span>Comprar {selectedPrint.label.split('—')[0]}</span>
                  <span>→</span>
                </a>
              )}
            </div>
          )}

          {/* MÓDULO D: Engagement e Impact Score */}
          <ArtworkEngagement 
            artworkId={artwork.id} 
            initialMetrics={artwork.artwork_metrics?.[0] || artwork.artwork_metrics} 
          />

        </div>

      </div>

      {/* MODAL POPUP PARA INSPECCIÓN DE FOTOS HISTÓRICAS */}
      {modalImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalImage(null)}
        >
          <div 
            className="relative max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setModalImage(null)}
              className="absolute top-4 right-4 bg-black/70 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm hover:bg-black transition z-10"
            >
              ✕
            </button>
            <img 
              src={formatImgSrc(modalImage)} 
              alt="Registro de proceso creativo anterior" 
              onError={(e) => { e.currentTarget.src = '/placeholder.jpg' }}
              className="w-full h-auto max-h-[80vh] object-contain rounded-xl"
            />
            <p className="text-center text-xs font-semibold text-gray-500 my-2">
              Registro de Archivo — Estado previo de la obra (Estudio JBU)
            </p>
          </div>
        </div>
      )}
    </>
  )
}