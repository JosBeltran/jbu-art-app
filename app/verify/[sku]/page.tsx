import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import VerifyCertificate from '@/components/VerifyCertificate'
import { activeCertificateBySku } from '@/lib/certificates/lookup.server'
import { verifyCertificateData } from '@/lib/certificates/integrity.server'
import { publicCertificate } from '@/lib/certificates/public'
import { resolveStoredCertificatePdf } from '@/lib/certificates/pdf.server'

export const dynamic = 'force-dynamic'

async function getVerificationData(skuParam: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const cleanSku = decodeURIComponent(skuParam).trim()

  // Fuente principal: el certificado vigente y su snapshot persistente.
  let { certificate } = await activeCertificateBySku(db, cleanSku)
  if (certificate) {
    // Si el PDF ya existe en Storage pero su registro quedó incompleto, se adopta aquí
    // (sin regenerar ni reemitir) para que el botón de descarga aparezca en cada obra.
    if (!(certificate.pdf_storage_path && certificate.pdf_hash)) {
      try {
        const stored = await resolveStoredCertificatePdf(db, certificate)
        if (stored?.certificate) certificate = { ...certificate, ...stored.certificate }
        else if (stored) certificate = { ...certificate, pdf_storage_path: stored.path, pdf_hash: stored.hash }
      } catch (err) {
        console.error('[verify] pdf metadata repair skipped', { sku: cleanSku, code: (err as any)?.code || (err as any)?.message })
      }
    }
    return { certificate: publicCertificate(certificate), dataIntegrity: verifyCertificateData(certificate), fallback: null }
  }

  // Sin certificado: solo identificación secundaria de la obra; nunca se muestra como verificada.
  const { data: artwork } = await db.from('artworks').select('sku, title, year, primary_image_url, image_url').ilike('sku', cleanSku).maybeSingle()
  if (!artwork) return null
  return { certificate: null, dataIntegrity: false, fallback: artwork }
}

type VerifyParams = { params: Promise<{ sku: string }> }

export default async function VerifyArtworkPage({ params }: VerifyParams) {
  const { sku } = await params
  const data = await getVerificationData(sku)
  if (!data) notFound()
  return <VerifyCertificate certificate={data.certificate} dataIntegrity={data.dataIntegrity} fallback={data.fallback} />
}
