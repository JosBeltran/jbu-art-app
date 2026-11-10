import { sortPrintVariants } from '@/lib/printImages'
import { isPrintId } from '@/lib/printManager'
import { getArtworkBySku } from '@/lib/artworks'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import ArtworkDetailClient from './ArtworkDetailClient'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { isHomeEligible } from '@/lib/homeSeries'
import { socialContext } from '@/lib/social/data.server'
import { socialImageUrl } from '@/lib/social/config'
import { artworkTitle, artworkDescription, artworkJsonLd, isIndexableArtwork, SITE_URL } from '@/lib/seo'

const isVersionDraft = artwork => artwork?.version_kind === 'SUCCESSOR' && !artwork.version_published_at

async function getPublicVersions(artworkId) {
  const { data, error } = await supabase.rpc('public_artwork_versions', { _artwork: artworkId })
  if (error) return []
  return data || []
}

const HIDDEN_PROVENANCE_TYPES = ['PRICE_CHANGED', 'IMAGE_UPDATED', 'SEO_UPDATED', 'ARCHIVED', 'WITHDRAWN']

// La ficha pública se resuelve en servidor para que un fallo de permisos/vistas anon
// no borre silenciosamente la cronología real del artwork.
async function getServerProvenance(artworkId, fallback = []) {
  try {
    const db = serviceClient()

    // Seleccionar el registro completo evita que una columna opcional ausente
    // invalide TODA la consulta. Solo campos permitidos se devuelven al cliente.
    const { data: rows, error: eventsError } = await db
      .from('provenance_events')
      .select('*')
      .eq('artwork_id', artworkId)
      .eq('visibility', 'PUBLIC')
      .order('created_at', { ascending: true })

    if (eventsError) {
      console.error('Server provenance lookup failed:', {
        artworkId, code: eventsError.code, message: eventsError.message
      })
      return fallback
    }

    const events = (rows || []).filter(
      (event) => !HIDDEN_PROVENANCE_TYPES.includes(event.event_type)
    )

    if (!events.length) return []

    const { data: imageRows, error: imagesError } = await db
      .from('provenance_event_images')
      .select('*')
      .eq('artwork_id', artworkId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (imagesError) {
      console.error('Server provenance images lookup failed:', {
        artworkId, code: imagesError.code, message: imagesError.message
      })
    }

    const visibleIds = new Set(events.map((event) => event.id))
    const byEvent = new Map()
    for (const image of imageRows || []) {
      if (!visibleIds.has(image.provenance_event_id)) continue
      const publicImage = {
        id: image.id,
        provenance_event_id: image.provenance_event_id,
        artwork_id: image.artwork_id,
        image_url: image.image_url,
        caption_es: image.caption_es,
        caption_en: image.caption_en,
        stage_label: image.stage_label,
        display_order: image.display_order,
        created_at: image.created_at
      }
      if (!byEvent.has(image.provenance_event_id)) byEvent.set(image.provenance_event_id, [])
      byEvent.get(image.provenance_event_id).push(publicImage)
    }

    const publicEvents = events.map((event) => {
      const images = byEvent.get(event.id) || []
      return {
        id: event.id,
        artwork_id: event.artwork_id,
        event_type: event.event_type,
        event_date: event.event_date,
        date_precision: event.date_precision,
        title: event.title,
        description: event.description,
        source: event.source,
        created_at: event.created_at,
        images,
        primary_image_url: images[0]?.image_url || event.primary_image_url || null,
        public_amount_mxn: event.show_sale_price_publicly ? event.amount_mxn ?? null : null
      }
    })

    console.info('Server public provenance loaded:', {
      artworkId, events: publicEvents.length, images: publicEvents.reduce((n, e) => n + e.images.length, 0)
    })
    return publicEvents
  } catch (error) {
    console.error('Server provenance unexpected failure:', {
      artworkId, message: error?.message || String(error)
    })
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
  const artwork = await getArtworkBySku(sku)

  if (!artwork || isVersionDraft(artwork)) notFound()

  const { print } = await searchParams
  const initialPrintId = isPrintId(print) ? print : undefined

  const versions = 'is_historical_version' in artwork ? await getPublicVersions(artwork.id) : []
  if (artwork.is_historical_version && !versions.some(row => !row.is_historical_version)) notFound()
  artwork.version_family = versions.length > 1 ? versions : []

  artwork.provenance_events = await getServerProvenance(artwork.id, artwork.provenance_events || [])
  // Resolve public image references once on the server, never from client URLs.
  try {
    const db = serviceClient()
    const map = await getPrintMediaMap(db, [artwork], artwork.artwork_prints || [])
    if (artwork.allows_prints && artwork.print_price_mxn > 0 && !artwork.artwork_prints?.length) {
      const { data, error } = await db.from('artwork_prints').select('id')
        .eq('artwork_id', artwork.id).not('title', 'is', null).limit(1)
      artwork.has_managed_prints = !error && Boolean(data?.length)
    }
    const media = map[artwork.id]
    artwork.print_media = { firstFlagged: media?.firstFlagged || null }
    artwork.artwork_prints = sortPrintVariants(artwork.artwork_prints || []).map(v => ({
      id: v.id, title: v.title, title_en: v.title_en, description: v.description, description_en: v.description_en,
      size: v.size, finish: v.finish, paper_type: v.paper_type, framing: v.framing, price: v.price,
      edition_type: v.edition_type, max_edition_size: v.max_edition_size, prints_sold: v.prints_sold,
      edition_size: v.edition_size, print_limit: v.print_limit, is_available: v.is_available,
      resolved_print_image_url: media?.variants?.find(m => m.id === v.id)?.resolved_print_image_url || null,
    }))
  } catch (error) {
    console.error('[artwork] print media lookup unavailable:', error?.code || error?.message)
  }


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
      <ArtworkDetailClient key={initialPrintId || sku} initialPrintId={initialPrintId} artwork={artwork} siteSettings={siteSettings} social={social ? { ...social, titleEn: artwork.title_en || '' } : null} />
    </>
  )
}
