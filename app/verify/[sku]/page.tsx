import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import VerifyCertificate from '@/components/VerifyCertificate'

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

  // Página pública: no se envían nombre ni correo del coleccionista al navegador.
  const ownerProfile = artwork.current_owner_id ? { registered: true } : null

  // Solo campos públicos: nunca notas internas, correos, precios ni IDs de propietario.
  const PUBLIC_FIELDS = ['id', 'sku', 'title', 'artist', 'year', 'medium', 'technique', 'dimensions', 'edition', 'edition_type', 'certificate_number', 'certificate_issued_at', 'certificate_hash', 'ownership_status', 'claimed_at', 'ownership_verified_at', 'primary_image_url', 'image_url']
  const publicArtwork = Object.fromEntries(PUBLIC_FIELDS.filter((k) => artwork[k] != null).map((k) => [k, artwork[k]]))
  return { artwork: publicArtwork, ownerProfile }
}

type VerifyParams = { params: Promise<{ sku: string }> }

export default async function VerifyArtworkPage({ params }: VerifyParams) {
  const { sku } = await params
  const data = await getVerificationData(sku)

  if (!data) notFound()

  const { artwork, ownerProfile } = data
  const rawImage = artwork.primary_image_url || artwork.image_url

  return (
    <VerifyCertificate artwork={artwork} ownerProfile={ownerProfile} rawImage={rawImage} />
  )
}
