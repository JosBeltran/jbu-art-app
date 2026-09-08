import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import DownloadPdfButton from '@/components/DownloadPdfButton'
import ArtworkImage from '@/components/ArtworkImage'

export const dynamic = 'force-dynamic'

async function getVerificationData(skuParam) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) return null

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const cleanSku = decodeURIComponent(skuParam).trim()

  const { data: artwork, error } = await supabase
    .from('artworks')
    .select('*')
    .ilike('sku', cleanSku)
    .maybeSingle()

  if (error || !artwork) return null

  let ownerProfile = null
  if (artwork.current_owner_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', artwork.current_owner_id)
      .maybeSingle()

    ownerProfile = profile
  }

  return { artwork, ownerProfile }
}

export default async function VerifyArtworkPage({ params }) {
  const { sku } = await params
  const data = await getVerificationData(sku)

  if (!data) notFound()

  const { artwork, ownerProfile } = data

  // Pasamos el string raw directamente (sea URL completa de Supabase o ruta 'assets-optimized/...')
  const rawImage = artwork.primary_image_url || artwork.image_url

  return (
    <div className="min-h-screen bg-neutral-900 text-stone-900 font-serif pb-16 pt-8 px-4 flex flex-col items-center print:bg-white print:p-0 print:m-0">
      
      {/* REGLAS CSS PARA IMPRESIÓN FORZADA EN 1 PÁGINA */}
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0;
          }
          body {
            background-color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          header, nav, footer, .print\\:hidden {
            display: none !important;
          }
          #classic-certificate {
            box-shadow: none !important;
            border-width: 8px !important;
            max-width: 100% !important;
            width: 100% !important;
            height: 100vh !important;
            max-height: 100vh !important;
            margin: 0 !important;
            padding: 1.5rem !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* BARRA SUPERIOR DE ACCIONES */}
      <div className="w-full max-w-2xl flex justify-between items-center mb-6 print:hidden">
        <Link href="/collection" className="text-xs font-mono text-stone-400 hover:text-amber-400 transition tracking-widest uppercase">
          ← Mi Colección
        </Link>
        <DownloadPdfButton elementId="classic-certificate" sku={artwork.sku} />
      </div>

      {/* LIENZO DEL CERTIFICADO */}
      <div
        id="classic-certificate"
        className="w-full max-w-2xl bg-[#FDFBF7] text-stone-800 p-6 sm:p-8 shadow-2xl relative border-[10px] border-[#E8E2D5] outline outline-1 outline-stone-300 print:border-[8px]"
      >
        <div className="border border-stone-400/80 p-5 sm:p-6 relative space-y-4">
          
          {/* ENCABEZADO Y LOGO */}
          <div className="text-center space-y-2">
            <div className="flex justify-center mb-1">
              <img 
                src="/logo.png" 
                alt="Logo JBU" 
                className="h-12 w-auto object-contain"
              />
            </div>
            
            <div className="space-y-0.5">
              <h1 className="text-lg sm:text-xl font-serif tracking-[0.2em] text-stone-900 uppercase font-bold">
                CERTIFICATE
              </h1>
              <p className="text-xl sm:text-2xl font-serif italic text-stone-700 tracking-wide">
                of Authenticity
              </p>
              <p className="text-[9px] font-sans tracking-[0.25em] text-stone-500 uppercase font-semibold">
                OF ORIGINAL ARTWORK
              </p>
            </div>

            <h2 className="text-sm sm:text-base font-serif tracking-widest font-bold text-stone-900 pt-1 uppercase border-b border-stone-300 pb-2">
              JOSUÉ BELTRÁN URESTI
            </h2>
          </div>

          {/* MINIATURA DE LA OBRA Y TEXTO */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-1">
            <div className="sm:col-span-4 aspect-[4/3] bg-stone-100 border border-stone-400 p-1 shadow-sm overflow-hidden flex items-center justify-center max-h-32 mx-auto sm:mx-0">
              <ArtworkImage 
                title={artwork.title}
                primaryUrl={rawImage}
                sku={artwork.sku}
              />
            </div>

            <div className="sm:col-span-8 text-[10px] font-sans leading-relaxed text-stone-600 text-justify space-y-1.5">
              <p>
                Este documento certifica oficialmente que la obra especificada en este registro es una pieza única, original y auténtica creada por el artista identificado.
              </p>
              <p>
                La pieza ha sido completada como una creación singular dentro del catálogo oficial de Estudio JBU. El artista conserva todos los derechos de propiedad intelectual y reproducción.
              </p>
            </div>
          </div>

          {/* FICHA TÉCNICA */}
          <div className="space-y-2 pt-2 font-sans text-xs">
            <div className="flex items-baseline gap-2 border-b border-stone-300 pb-1">
              <span className="font-serif font-bold text-stone-900 w-36 shrink-0 text-[11px]">Título de la Obra:</span>
              <span className="font-serif italic text-stone-800 font-semibold text-xs">{artwork.title}</span>
            </div>

            <div className="flex items-baseline gap-2 border-b border-stone-300 pb-1">
              <span className="font-serif font-bold text-stone-900 w-36 shrink-0 text-[11px]">Técnica / Medio:</span>
              <span className="text-stone-700 text-[11px]">{artwork.medium || artwork.technique || 'Técnica Mixta'}</span>
            </div>

            <div className="flex items-baseline gap-2 border-b border-stone-300 pb-1">
              <span className="font-serif font-bold text-stone-900 w-36 shrink-0 text-[11px]">Año de Creación:</span>
              <span className="text-stone-700 text-[11px]">{artwork.year || '2026'}</span>
            </div>

            <div className="flex items-baseline gap-2 border-b border-stone-300 pb-1">
              <span className="font-serif font-bold text-stone-900 w-36 shrink-0 text-[11px]">Dimensiones:</span>
              <span className="text-stone-700 text-[11px]">{artwork.dimensions || 'N/A'}</span>
            </div>

            <div className="flex items-baseline gap-2 border-b border-stone-300 pb-1">
              <span className="font-serif font-bold text-stone-900 w-36 shrink-0 text-[11px]">Número de Certificado:</span>
              <span className="font-mono text-amber-900 font-bold text-[11px]">{artwork.sku}</span>
            </div>

            <div className="flex items-baseline gap-2 border-b border-stone-300 pb-1">
              <span className="font-serif font-bold text-stone-900 w-36 shrink-0 text-[11px]">Propietario Registrado:</span>
              <span className="text-stone-800 font-medium text-[11px]">
                {ownerProfile ? ownerProfile.full_name : 'Estudio JBU (Disponible)'}
              </span>
            </div>
          </div>

          {/* CUIDADOS */}
          <div className="pt-1 text-[9px] font-sans text-stone-500 leading-normal space-y-0.5">
            <p className="font-bold uppercase tracking-wider text-stone-700">Instrucciones de Cuidado y Conservación:</p>
            <p className="text-justify">
              Para conservar el estado óptimo de la obra, evite la exposición directa a la luz solar, humedad excesiva y fluctuaciones extremas de temperatura. No utilice limpiadores químicos. Limpie suavemente con un paño seco y suave.
            </p>
          </div>

          {/* FIRMAS */}
          <div className="pt-4 border-t border-stone-300 grid grid-cols-2 gap-8 items-end text-center">
            <div className="space-y-1">
              <div className="font-serif italic text-sm text-stone-800 h-6 flex items-end justify-center">
                Josué Beltrán Uresti
              </div>
              <div className="border-t border-stone-400 pt-1 text-[8px] font-sans uppercase tracking-wider text-stone-500 font-semibold">
                Firma del Artista
              </div>
            </div>

            <div className="space-y-1">
              <div className="font-mono text-xs text-stone-700 h-6 flex items-end justify-center font-bold">
                {artwork.certificate_issued_at 
                  ? new Date(artwork.certificate_issued_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
                  : '08 sep 2026'}
              </div>
              <div className="border-t border-stone-400 pt-1 text-[8px] font-sans uppercase tracking-wider text-stone-500 font-semibold">
                Fecha de Emisión
              </div>
            </div>
          </div>

          {/* HASH Y PIE */}
          <div className="pt-2 text-center space-y-0.5">
            {artwork.certificate_hash && (
              <div className="font-mono text-[8px] text-stone-500 break-all bg-stone-100/80 p-1 rounded border border-stone-200">
                HASH SHA-256: {artwork.certificate_hash}
              </div>
            )}
            <p className="text-[9px] font-sans font-bold tracking-widest text-stone-400 uppercase pt-0.5">
              estudiojbu.com
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}