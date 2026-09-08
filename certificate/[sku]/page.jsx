import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import PrintButton from './PrintButton'

// Desactivar el layout global si no quieres navegación en la impresión
export const metadata = {
  title: 'Certificado de Autenticidad — Estudio JBU',
}

async function getArtworkData(sku) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: artwork } = await supabase
    .from('artworks')
    .select('*')
    .eq('sku', sku)
    .single()

  return artwork
}

export default async function CertificatePage({ params }) {
  const { sku } = params
  const artwork = await getArtworkData(sku)

  // Datos de respaldo para vista previa en caso de que la BD no devuelva datos
  const data = artwork || {
    sku: sku || 'JBU-001',
    title: 'Orbitals No. 12',
    year: '2026',
    medium: 'Acrílico, tinta y capa protectora de resina epóxica sobre lienzo',
    dimensions: '100 x 80 cm',
    series: 'Serie ORBITALS',
    artist: 'Josué Beltrán Uresti'
  }

  // Generar QR en base64 para renderizado inmediato
  const targetUrl = `https://josueuresti.com/artwork/${data.sku}`
  const qrDataUrl = await QRCode.toDataURL(targetUrl, {
    width: 300,
    margin: 1,
    color: { dark: '#111111', light: '#FFFFFF' }
  })

  return (
    <div className="bg-neutral-100 min-h-screen py-8 print:py-0 print:bg-white flex flex-col items-center justify-center">
      {/* Botón flotante para imprimir (Se oculta al imprimir) */}
      <PrintButton />

      {/* HOJA DE CERTIFICADO (Proporción Carta/A4) */}
      <div className="w-[210mm] min-h-[297mm] bg-white text-neutral-900 p-16 border border-neutral-300 print:border-none shadow-xl print:shadow-none print:w-full print:h-full print:p-12 flex flex-col justify-between font-serif relative">
        
        {/* MARCO EDITORIAL FINO */}
        <div className="absolute inset-6 border border-neutral-200 pointer-events-none print:inset-4" />

        {/* ENCABEZADO */}
        <header className="text-center space-y-2 relative z-10 pt-4">
          <p className="text-[11px] font-sans tracking-[0.3em] uppercase text-neutral-500">
            Estudio JBU — Registro de Obra
          </p>
          <h1 className="text-2xl font-light tracking-[0.2em] uppercase text-neutral-900 border-b border-neutral-200 pb-4 mx-auto w-3/4">
            Certificado de Autenticidad
          </h1>
        </header>

        {/* CUERPO DEL CERTIFICADO */}
        <main className="space-y-8 my-8 relative z-10 px-6 font-sans">
          <p className="text-center text-sm leading-relaxed text-neutral-600 font-serif italic max-w-lg mx-auto">
            Por medio del presente documento se certifica que la obra aquí descrita es una pieza original, única y realizada totalmente a mano por el artista.
          </p>

          {/* FICHA TÉCNICA */}
          <div className="grid grid-cols-12 gap-6 bg-neutral-50/50 p-6 border border-neutral-100 rounded-sm">
            <div className="col-span-8 space-y-4">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-neutral-400 block font-mono">
                  Título de la Obra
                </span>
                <h2 className="text-xl font-serif font-medium text-neutral-900">
                  {data.title}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-neutral-400 block font-mono">
                    Artista
                  </span>
                  <p className="font-medium text-neutral-800">{data.artist || 'Josué Beltrán Uresti'}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-neutral-400 block font-mono">
                    Año de Creación
                  </span>
                  <p className="font-medium text-neutral-800">{data.year}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-neutral-400 block font-mono">
                    Técnica / Medio
                  </span>
                  <p className="font-medium text-neutral-800 leading-snug">{data.medium}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-neutral-400 block font-mono">
                    Dimensiones
                  </span>
                  <p className="font-medium text-neutral-800">{data.dimensions}</p>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-widest text-neutral-400 block font-mono">
                  Identificador / SKU
                </span>
                <p className="font-mono text-sm font-semibold text-neutral-900 tracking-wider">
                  {data.sku}
                </p>
              </div>
            </div>

            {/* MÓDULO QR & VERIFICACIÓN */}
            <div className="col-span-4 flex flex-col items-center justify-center border-l border-neutral-200 pl-6 text-center space-y-2">
              <img 
                src={qrDataUrl} 
                alt={`QR ${data.sku}`} 
                className="w-28 h-28 border border-neutral-200 p-1 bg-white"
              />
              <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400">
                Registro Digital
              </span>
              <p className="text-[9px] text-neutral-500 leading-tight">
                Escanee para verificar procedencia e historial en la plataforma.
              </p>
            </div>
          </div>
        </main>

        {/* PIE DE PÁGINA Y FIRMA */}
        <footer className="grid grid-cols-2 gap-12 pt-8 border-t border-neutral-200 relative z-10 font-sans">
          <div className="space-y-12">
            <p className="text-[10px] text-neutral-400 leading-normal">
              Este certificado está respaldado por el registro digital de proveniencia en <strong>josueuresti.com</strong>. Cualquier alteración física o digital invalidará este registro.
            </p>
            <div>
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                Fecha de Emisión
              </span>
              <p className="text-xs font-medium text-neutral-700">
                {new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-end items-center text-center space-y-2">
            {/* LÍNEA DE FIRMA MANUSCRITA */}
            <div className="w-48 border-b border-neutral-400 h-12" />
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
              Firma del Artista
            </span>
            <span className="text-xs font-serif italic text-neutral-800">
              Josué Beltrán Uresti
            </span>
          </div>
        </footer>

      </div>
    </div>
  )
}