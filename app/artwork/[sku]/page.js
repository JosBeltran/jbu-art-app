import { getArtworkBySku } from '@/lib/artworks'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { isHomeEligible } from '@/lib/homeSeries'
import { socialContext } from '@/lib/social/data.server'
import { socialImageUrl } from '@/lib/social/config'
import { artworkTitle, artworkDescription, isIndexableArtwork, SITE_URL } from '@/lib/seo'

import ArtworkDetailPage, { isVersionDraft } from './ArtworkDetailPage'

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
  if (!artwork || isVersionDraft(artwork)) return { title: 'Obra no encontrada', robots: { index: false } }

  const social = await socialContext(artwork).catch(() => null)
  const description = social?.presentation?.description || artworkDescription(artwork)
  const canonical = `${SITE_URL}/artwork/${encodeURIComponent(sku)}`
  const images = [{ url: socialImageUrl(sku, 'horizontal', 'es', social?.version), width: 1200, height: 630, alt: social?.presentation?.title || artwork.title }]
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

  const title = social ? [social.presentation.title, social.presentation.artist].filter(Boolean).join(' | ') : artworkTitle(artwork)
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots,
    openGraph: { title, description, type: 'article', url: canonical, siteName: 'Josué Beltrán Uresti', images },
    twitter: { card: 'summary_large_image', title, description, images },
  }
}

export default async function ArtworkPage({ params, searchParams }) {
  const { sku } = await params
  const { print } = await searchParams
  return <ArtworkDetailPage sku={sku} print={print} />
}
