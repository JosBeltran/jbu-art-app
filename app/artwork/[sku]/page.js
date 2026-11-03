import { getArtworkBySku } from '@/lib/artworks'
import ArtworkDetailClient from './ArtworkDetailClient'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { isHomeEligible } from '@/lib/homeSeries'
import { socialContext } from '@/lib/social/data.server'
import { socialImageUrl } from '@/lib/social/config'
import { artworkTitle, artworkDescription, artworkJsonLd, isIndexableArtwork, SITE_URL } from '@/lib/seo'

const HIDDEN_PROVENANCE_TYPES = ['PRICE_CHANGED', 'IMAGE_UPDATED', 'SEO_UPDATED', 'ARCHIVED', 'WITHDRAWN']

// La ficha pública se resuelve en servidor para que un fallo de permisos/vistas anon
// no borre silenciosamente la cronología real del artwork.
async function getServerProvenance(artworkId, fallback = []) {
  try {
    const db = serviceClient()
    const { data: events, error: eventsError } = await db
      .from('provenance_events')
      .select('id, artwork_id, event_type, event_date, date_precision, title, description, source, primary_image_url, created_at, show_sale_price_publicly, amount_mxn')
      .eq('artwork_id', artworkId)
      .eq('visibility', 'PUBLIC')
      .not('event_type', 'in', `(${HIDDEN_PROVENANCE_TYPES.join(',')})`)
      .order('created_at', { ascending: true })

    if (eventsError) {
      console.error('Server provenance lookup failed:', eventsError.code, eventsError.message)
      return fallback
    }

    if (!events?.length) return []

    let images = []
    const { data: imageRows, error: imagesError } = await db
      .from('provenance_event_images')
      .select('id, provenance_event_id, artwork_id, image_url, caption_es, caption_en, stage_label, display_order, created_at')
      .eq('artwork_id', artworkId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (imagesError) {
      // Las imágenes son opcionales: nunca deben ocultar la procedencia textual.
      console.error('Server provenance images lookup failed:', imagesError.code, imagesError.message)
    } else {
      images = imageRows || []
    }

    const byEvent = new Map()
    for (const image of images) {
      if (!byEvent.has(image.provenance_event_id)) byEvent.set(image.provenance_event_id, [])
      byEvent.get(image.provenance_event_id).push(image)
    }

    return events.map((event) => {
      const eventImages = byEvent.get(event.id) || []
      let primaryImage = event.primary_image_url || null
      // La primera imagen queda como portada; la UI muestra todas las fotos
      // individuales sin depender de un collage generado en tiempo real.
      if (eventImages.length > 0) primaryImage = eventImages[0].image_url

      return {
        ...event,
        images: eventImages,
        primary_image_url: primaryImage,
        public_amount_mxn: event.show_sale_price_publicly ? event.amount_mxn : null,
        amount_mxn: undefined,
        show_sale_price_publicly: undefined
      }
    })
  } catch (error) {
    console.error('Server provenance unexpected failure:', error?.message || error)
    return fallback
  }
}

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

export default async function ArtworkPage({ params }) {
  const { sku } = await params
  const artwork = await getArtworkBySku(sku)

  if (!artwork) {
    notFound()
  }

  artwork.provenance_events = await getServerProvenance(artwork.id, artwork.provenance_events || [])

  // Canal de consulta de precio (migración 20261103); si falta, WhatsApp por defecto.
  let siteSettings = null
  try {
    const { data } = await supabase.from('site_settings').select('inquiry_channel, whatsapp_number').eq('id', true).maybeSingle()
    siteSettings = data || null
  } catch {
    siteSettings = null
  }

  const social = await socialContext(artwork).catch(() => null)

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(artworkJsonLd(artwork)).replace(/</g, '\\u003c') }} />
      <ArtworkDetailClient artwork={artwork} siteSettings={siteSettings} social={social ? { ...social, titleEn: artwork.title_en || '' } : null} />
    </>
  )
}
