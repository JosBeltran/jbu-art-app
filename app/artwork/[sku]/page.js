import { getArtworkBySku } from '@/lib/artworks'
import ArtworkDetailClient from './ArtworkDetailClient'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { isHomeEligible } from '@/lib/homeSeries'
import { artworkTitle, artworkDescription, artworkJsonLd, isIndexableArtwork, SITE_URL } from '@/lib/seo'

// Lectura pública (vista sin reserva ni identidades) para metadatos de lote. Si falla, se usan los de siempre.
async function getOpenLot(artworkId) {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data } = await sb.from('auctions_public').select('lot_number, auction_event_id, status').eq('artwork_id', artworkId).in('status', ['UPCOMING', 'LIVE']).not('auction_event_id', 'is', null).limit(1)
    return data?.[0] || null
  } catch { return null }
}

export const revalidate = 0

// Obras ocultas (borrador o Serie próxima) siguen accesibles por enlace directo, pero no se indexan.
async function isPublicArtwork(artwork) {
  try {
    const { data, error } = await supabase.from('series').select('id, title, editorial_status, auto_launch, launch_date')
    if (error || !data) return false
    return isIndexableArtwork(artwork, isHomeEligible(artwork, data))
  } catch { return false }
}

export async function generateMetadata({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)
  if (!artwork) return { title: 'Obra no encontrada' }

  const description = artworkDescription(artwork)
  const canonical = `${SITE_URL}/artwork/${encodeURIComponent(sku)}`
  const images = artwork.primary_image_url ? [{ url: artwork.primary_image_url, alt: `${artwork.title} — Josué Beltrán Uresti` }] : undefined
  const robots = (await isPublicArtwork(artwork)) ? undefined : { index: false, follow: true }

  const lot = await getOpenLot(artwork.id)
  if (lot?.lot_number) {
    const lotTitle = `Lote ${String(lot.lot_number).padStart(2, '0')} — ${artwork.title} | Subasta JBU`
    const lotDesc = `Puja en línea por ${artwork.title}.`
    return {
      title: { absolute: lotTitle },
      description: lotDesc,
      alternates: { canonical },
      robots,
      openGraph: { title: lotTitle, description: lotDesc, type: 'website', url: canonical, images },
      twitter: { card: 'summary_large_image', title: lotTitle, description: lotDesc, images },
    }
  }

  const title = artworkTitle(artwork)
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots,
    openGraph: { title, description, type: 'article', url: canonical, siteName: 'Josué Beltrán Uresti', images },
    twitter: { card: 'summary_large_image', title, description, images },
  }
}

export default async function ArtworkPage({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)

  if (!artwork) {
    notFound()
  }

  // Canal de consulta de precio (migración 20261103); si falta, WhatsApp por defecto.
  let siteSettings = null
  try {
    const { data } = await supabase.from('site_settings').select('inquiry_channel, whatsapp_number').eq('id', true).maybeSingle()
    siteSettings = data || null
  } catch {
    siteSettings = null
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(artworkJsonLd(artwork)).replace(/</g, '\\u003c') }} />
      <ArtworkDetailClient artwork={artwork} siteSettings={siteSettings} />
    </>
  )
}
