import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import ArtworkImage from '@/components/ArtworkImage'
import CertificateActions from '@/components/CertificateActions'
import { Tile } from '@carbon/react'
import styles from './Verify.module.css'

export const dynamic = 'force-dynamic'

async function getVerificationData(skuParam: string) {
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

type VerifyParams = { params: Promise<{ sku: string }> }

export default async function VerifyArtworkPage({ params }: VerifyParams) {
  const { sku } = await params
  const data = await getVerificationData(sku)

  if (!data) notFound()

  const { artwork, ownerProfile } = data
  const rawImage = artwork.primary_image_url || artwork.image_url

  const detailRows: Array<{ label: string; value: string; variant?: 'title' | 'mono' }> = [
    { label: 'Título de la Obra', value: artwork.title, variant: 'title' },
    {
      label: 'Técnica / Medio',
      value: artwork.medium || artwork.technique || 'Técnica Mixta',
    },
    { label: 'Año de Creación', value: artwork.year || '2026' },
    { label: 'Dimensiones', value: artwork.dimensions || 'N/A' },
    { label: 'Número de Certificado', value: artwork.sku, variant: 'mono' },
    {
      label: 'Propietario Registrado',
      value: ownerProfile ? ownerProfile.full_name : 'Estudio JBU (Disponible)',
    },
  ]

  return (
    <div className={styles.page}>

      {/* ACCIONES (no se imprimen) */}
      <CertificateActions sku={artwork.sku} />

      {/* CERTIFICADO */}
      <Tile id="classic-certificate" className={styles.certificate}>
        <div id="certificate-inner" className={styles.inner}>

          {/* ENCABEZADO */}
          <header className={styles.header}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Estudio JBU" className={styles.logo} />

            <div className={styles.certTitle}>Certificate</div>
            <div className={styles.certSubtitle}>of Authenticity</div>
            <div className={styles.certKicker}>Original Artwork</div>

            <div className={styles.artistBar}>
              <div className={styles.artistName}>JOSUÉ BELTRÁN URESTI</div>
            </div>
          </header>

          {/* OBRA + DESCRIPCIÓN */}
          <div className={styles.artworkRow}>
            <div className={styles.thumb}>
              <ArtworkImage
                title={artwork.title}
                primaryUrl={rawImage}
                sku={artwork.sku}
              />
            </div>

            <div className={styles.description}>
              <p>
                Este documento certifica que la obra identificada en este
                registro es una pieza original y auténtica creada por el
                artista identificado.
              </p>
              <p>
                La pieza forma parte del catálogo oficial de Estudio JBU.
                El artista conserva los derechos de propiedad intelectual y
                reproducción de la obra.
              </p>
            </div>
          </div>

          {/* INFORMACIÓN DE LA OBRA */}
          <section className={styles.details}>
            {detailRows.map(({ label, value, variant }) => (
              <div key={label} className={styles.detailRow}>
                <span className={styles.detailLabel}>{label}</span>
                <span
                  className={
                    variant === 'title'
                      ? styles.detailValueTitle
                      : variant === 'mono'
                      ? styles.detailValueMono
                      : styles.detailValue
                  }
                >
                  {value}
                </span>
              </div>
            ))}
          </section>

          {/* CONSERVACIÓN */}
          <section className={styles.care}>
            <div className={styles.careTitle}>Conservación</div>
            <p>
              Para conservar el estado óptimo de la obra, evite la exposición
              directa a la luz solar, humedad excesiva y fluctuaciones extremas
              de temperatura. No utilice limpiadores químicos. Limpie suavemente
              con un paño seco y suave.
            </p>
          </section>

          {/* FIRMAS */}
          <section className={styles.signatures}>
            <div>
              <div className={styles.signatureValue}>Josué Beltrán Uresti</div>
              <div className={styles.signatureLabel}>Firma del Artista</div>
            </div>

            <div>
              <div className={styles.signatureDate}>
                {artwork.certificate_issued_at
                  ? new Date(artwork.certificate_issued_at).toLocaleDateString(
                      'es-MX',
                      { year: 'numeric', month: 'short', day: 'numeric' }
                    )
                  : '13 sep 2026'}
              </div>
              <div className={styles.signatureLabel}>Fecha de Emisión</div>
            </div>
          </section>

          {/* HASH + IDENTIDAD */}
          <footer className={styles.footer}>
            {artwork.certificate_hash && (
              <div className={styles.hash}>
                SHA-256 · {artwork.certificate_hash}
              </div>
            )}
            <div className={styles.brand}>ESTUDIO JBU</div>
          </footer>

        </div>
      </Tile>

    </div>
  )
}
