import { getArtworkBySku } from '@/lib/artworks'
import ArtworkDetailClient from './ArtworkDetailClient'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

// Lectura pública (vista sin reserva ni identidades) para metadatos de lote. Si falla, se usan los de siempre.
async function getOpenLot(artworkId) {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data } = await sb.from('auctions_public').select('lot_number, auction_event_id, status').eq('artwork_id', artworkId).in('status', ['UPCOMING', 'LIVE']).not('auction_event_id', 'is', null).limit(1)
    return data?.[0] || null
  } catch { return null }
}

export const revalidate = 0

export async function generateMetadata({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)
  if (!artwork) return { title: 'Obra no encontrada' }

  const description = artwork.description
    ? String(artwork.description).slice(0, 160)
    : `${artwork.title} — obra original de Josué Beltrán Uresti con certificado digital de autenticidad.`

  const canonical = `https://www.josuebeltranuresti.com/artwork/${sku}`
  const images = artwork.primary_image_url ? [artwork.primary_image_url] : undefined

  const lot = await getOpenLot(artwork.id)
  if (lot?.lot_number) {
    const lotTitle = `Lote ${String(lot.lot_number).padStart(2, '0')} — ${artwork.title} | Subasta JBU`
    const lotDesc = `Puja en línea por ${artwork.title}.`
    return {
      title: lotTitle,
      description: lotDesc,
      alternates: { canonical },
      openGraph: { title: lotTitle, description: lotDesc, type: 'website', url: canonical, images },
      twitter: { card: 'summary_large_image', title: lotTitle, description: lotDesc, images },
    }
  }

  // Vista previa social profesional: título de la obra + autor, imagen principal y URL canónica.
  const ogTitle = `${artwork.title} — Josué Beltrán Uresti`
  return {
    title: `${artwork.title} | Estudio JBU`,
    description,
    alternates: { canonical },
    openGraph: {
      title: ogTitle,
      description,
      type: 'website',
      url: canonical,
      images
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description,
      images
    }
  }
}

export default async function ArtworkPage({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)

  if (!artwork) {
    notFound()
  }

  return <ArtworkDetailClient artwork={artwork} />
}
