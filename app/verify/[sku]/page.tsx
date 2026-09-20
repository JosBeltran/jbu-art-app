import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import ArtworkImage from '@/components/ArtworkImage'
import CertificateActions from '@/components/CertificateActions'
import { Tile } from '@carbon/react'

export const dynamic = 'force-dynamic'

async function getVerificationData(skuParam) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) return null

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
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
  const rawImage =
    artwork.primary_image_url || artwork.image_url

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#e9e7e2',
        color: '#262626',
        padding: '2.5rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: '"IBM Plex Sans", Arial, sans-serif',
      }}
    >

      {/* =====================================================
          TIPOGRAFÍA Y ESTILOS DE IMPRESIÓN
          ===================================================== */}

      <style>{`

        @media print {

          @page {
            size: letter portrait;
            margin: 0;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          header,
          nav,
          footer,
          .print\\\\:hidden {
            display: none !important;
          }

          #classic-certificate {
            width: 100% !important;
            max-width: none !important;
            height: 100vh !important;
            max-height: 100vh !important;
            margin: 0 !important;
            padding: 0.55in !important;
            border: 0 !important;
            box-shadow: none !important;
            background: #fdfcf9 !important;
          }

          #certificate-inner {
            height: 100% !important;
            box-sizing: border-box !important;
          }
        }

        @media screen {

          #classic-certificate {
            transition:
              transform 180ms ease,
              box-shadow 180ms ease;
          }

          #classic-certificate:hover {
            transform: translateY(-2px);
            box-shadow:
              0 28px 60px rgba(0,0,0,0.18) !important;
          }
        }

      `}</style>

      {/* =====================================================
          ACCIONES
          ===================================================== */}

      <CertificateActions sku={artwork.sku} />

      {/* =====================================================
          CERTIFICADO
          ===================================================== */}

      <Tile
        id="classic-certificate"
        style={{
          width: '100%',
          maxWidth: '40rem',
          background: '#fdfcf9',
          color: '#262626',
          padding: '1.15rem',
          boxShadow:
            '0 20px 50px rgba(0, 0, 0, 0.16)',
          position: 'relative',
          border: '1px solid #c9c5bb',
          boxSizing: 'border-box',
        }}
      >

        {/* MARCO INTERIOR */}

        <div
          id="certificate-inner"
          style={{
            border: '1px solid #8d8a82',
            padding: '1.6rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxSizing: 'border-box',
          }}
        >

          {/* =================================================
              ENCABEZADO
              ================================================= */}

          <header
            style={{
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >

            <img
              src="/logo.png"
              alt="Estudio JBU"
              style={{
                height: '2.1rem',
                width: 'auto',
                objectFit: 'contain',
                marginBottom: '0.65rem',
              }}
            />

            <div
              style={{
                fontFamily:
                  '"IBM Plex Sans", Arial, sans-serif',
                fontSize: '0.78rem',
                fontWeight: 600,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: '#252525',
              }}
            >
              Certificate
            </div>

            <div
              style={{
                fontFamily:
                  '"IBM Plex Serif", Georgia, serif',
                fontSize: '1.5rem',
                fontStyle: 'italic',
                lineHeight: 1.15,
                color: '#343230',
                marginTop: '0.05rem',
              }}
            >
              of Authenticity
            </div>

            <div
              style={{
                fontFamily:
                  '"IBM Plex Sans", Arial, sans-serif',
                fontSize: '0.52rem',
                fontWeight: 500,
                letterSpacing: '0.32em',
                textTransform: 'uppercase',
                color: '#77736b',
                marginTop: '0.35rem',
              }}
            >
              Original Artwork
            </div>

            <div
              style={{
                width: '100%',
                borderBottom: '1px solid #c8c4bb',
                marginTop: '0.85rem',
                paddingBottom: '0.45rem',
              }}
            >
              <div
                style={{
                  fontFamily:
                    '"IBM Plex Sans", Arial, sans-serif',
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  letterSpacing: '0.22em',
                  color: '#33312e',
                }}
              >
                JOSUÉ BELTRÁN URESTI
              </div>
            </div>

          </header>

          {/* =================================================
              OBRA + DESCRIPCIÓN
              ================================================= */}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                '8.5rem minmax(0, 1fr)',
              gap: '1.2rem',
              alignItems: 'center',
            }}
          >

            {/* IMAGEN */}

            <div
              style={{
                width: '8.5rem',
                height: '6.25rem',
                background: '#f3f1ec',
                border: '1px solid #aaa69d',
                padding: '0.2rem',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArtworkImage
                title={artwork.title}
                primaryUrl={rawImage}
                sku={artwork.sku}
              />
            </div>

            {/* TEXTO */}

            <div
              style={{
                fontFamily:
                  '"IBM Plex Sans", Arial, sans-serif',
                fontSize: '0.68rem',
                lineHeight: 1.55,
                color: '#55514b',
              }}
            >

              <p
                style={{
                  margin: '0 0 0.55rem',
                }}
              >
                Este documento certifica que la obra
                identificada en este registro es una pieza
                original y auténtica creada por el artista
                identificado.
              </p>

              <p style={{ margin: 0 }}>
                La pieza forma parte del catálogo oficial
                de Estudio JBU. El artista conserva los
                derechos de propiedad intelectual y
                reproducción de la obra.
              </p>

            </div>

          </div>

          {/* =================================================
              INFORMACIÓN DE LA OBRA
              ================================================= */}

          <section
            style={{
              borderTop: '1px solid #c8c4bb',
              paddingTop: '0.65rem',
              display: 'flex',
              flexDirection: 'column',
            }}
          >

            {[
              [
                'Título de la Obra',
                artwork.title,
                true,
              ],
              [
                'Técnica / Medio',
                artwork.medium ||
                  artwork.technique ||
                  'Técnica Mixta',
                false,
              ],
              [
                'Año de Creación',
                artwork.year || '2026',
                false,
              ],
              [
                'Dimensiones',
                artwork.dimensions || 'N/A',
                false,
              ],
              [
                'Número de Certificado',
                artwork.sku,
                'mono',
              ],
              [
                'Propietario Registrado',
                ownerProfile
                  ? ownerProfile.full_name
                  : 'Estudio JBU (Disponible)',
                false,
              ],
            ].map(([label, value, type]) => (

              <div
                key={label}
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '8.5rem minmax(0, 1fr)',
                  gap: '0.75rem',
                  padding:
                    '0.3rem 0',
                  borderBottom:
                    '1px solid #e4e1db',
                  alignItems: 'baseline',
                }}
              >

                <span
                  style={{
                    fontFamily:
                      '"IBM Plex Sans", Arial, sans-serif',
                    fontSize: '0.57rem',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#69655e',
                  }}
                >
                  {label}
                </span>

                <span
                  style={{
                    fontFamily:
                      type === true
                        ? '"IBM Plex Serif", Georgia, serif'
                        : type === 'mono'
                        ? '"IBM Plex Mono", monospace'
                        : '"IBM Plex Sans", Arial, sans-serif',
                    fontSize:
                      type === true
                        ? '0.78rem'
                        : type === 'mono'
                        ? '0.62rem'
                        : '0.67rem',
                    fontStyle:
                      type === true
                        ? 'italic'
                        : 'normal',
                    fontWeight:
                      type === true
                        ? 500
                        : type === 'mono'
                        ? 500
                        : 400,
                    color:
                      type === 'mono'
                        ? '#52504b'
                        : '#292724',
                    wordBreak:
                      type === 'mono'
                        ? 'break-all'
                        : 'normal',
                  }}
                >
                  {value}
                </span>

              </div>

            ))}

          </section>

          {/* =================================================
              CONSERVACIÓN
              ================================================= */}

          <section
            style={{
              fontFamily:
                '"IBM Plex Sans", Arial, sans-serif',
              fontSize: '0.57rem',
              lineHeight: 1.45,
              color: '#716d65',
            }}
          >

            <div
              style={{
                fontSize: '0.53rem',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#4e4b45',
                marginBottom: '0.15rem',
              }}
            >
              Conservación
            </div>

            <p
              style={{
                margin: 0,
                textAlign: 'justify',
              }}
            >
              Para conservar el estado óptimo de la obra,
              evite la exposición directa a la luz solar,
              humedad excesiva y fluctuaciones extremas
              de temperatura. No utilice limpiadores
              químicos. Limpie suavemente con un paño
              seco y suave.
            </p>

          </section>

          {/* =================================================
              FIRMAS
              ================================================= */}

          <section
            style={{
              display: 'grid',
              gridTemplateColumns:
                '1fr 1fr',
              gap: '2.5rem',
              paddingTop: '0.8rem',
              borderTop:
                '1px solid #c8c4bb',
              textAlign: 'center',
            }}
          >

            {/* FIRMA */}

            <div>

              <div
                style={{
                  fontFamily:
                    '"IBM Plex Serif", Georgia, serif',
                  fontStyle: 'italic',
                  fontSize: '0.9rem',
                  color: '#302e2b',
                  height: '1.35rem',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                Josué Beltrán Uresti
              </div>

              <div
                style={{
                  borderTop:
                    '1px solid #929087',
                  paddingTop: '0.25rem',
                  fontFamily:
                    '"IBM Plex Sans", Arial, sans-serif',
                  fontSize: '0.47rem',
                  fontWeight: 600,
                  letterSpacing: '0.11em',
                  textTransform: 'uppercase',
                  color: '#77736b',
                }}
              >
                Firma del Artista
              </div>

            </div>

            {/* FECHA */}

            <div>

              <div
                style={{
                  fontFamily:
                    '"IBM Plex Mono", monospace',
                  fontSize: '0.63rem',
                  color: '#45423d',
                  height: '1.35rem',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                {artwork.certificate_issued_at
                  ? new Date(
                      artwork.certificate_issued_at
                    ).toLocaleDateString(
                      'es-MX',
                      {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }
                    )
                  : '13 sep 2026'}
              </div>

              <div
                style={{
                  borderTop:
                    '1px solid #929087',
                  paddingTop: '0.25rem',
                  fontFamily:
                    '"IBM Plex Sans", Arial, sans-serif',
                  fontSize: '0.47rem',
                  fontWeight: 600,
                  letterSpacing: '0.11em',
                  textTransform: 'uppercase',
                  color: '#77736b',
                }}
              >
                Fecha de Emisión
              </div>

            </div>

          </section>

          {/* =================================================
              HASH + IDENTIDAD
              ================================================= */}

          <footer
            style={{
              textAlign: 'center',
              paddingTop: '0.15rem',
            }}
          >

            {artwork.certificate_hash && (

              <div
                style={{
                  fontFamily:
                    '"IBM Plex Mono", monospace',
                  fontSize: '0.42rem',
                  lineHeight: 1.35,
                  color: '#77736b',
                  wordBreak: 'break-all',
                  background: '#f3f2ef',
                  padding: '0.25rem 0.4rem',
                  border:
                    '1px solid #ddd9d1',
                  marginBottom: '0.35rem',
                }}
              >
                SHA-256 · {artwork.certificate_hash}
              </div>

            )}

            <div
              style={{
                fontFamily:
                  '"IBM Plex Sans", Arial, sans-serif',
                fontSize: '0.5rem',
                fontWeight: 600,
                letterSpacing: '0.2em',
                color: '#aaa69d',
                textTransform: 'uppercase',
              }}
            >
              ESTUDIO JBU
            </div>

          </footer>

        </div>
      </Tile>

    </div>
  )
}
