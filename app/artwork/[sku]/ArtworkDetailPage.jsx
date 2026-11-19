import { fineArtPublic, loadFineArtVariants } from '@/lib/productCatalog/commerce.server'
import CommercialPresentations from '@/app/prints/[variantId]/CommercialPresentations'
import { artworkDiscussionsEnabled } from '@/lib/artworkComments.server'
import PrintDetail from '@/app/prints/[variantId]/PrintDetail'
import { originalArtworkImage } from '@/lib/artworkMedia'
import { requestMarketCountry } from '@/lib/market.server'
import { loadShippingSettings, withShippingCountries } from '@/lib/shippingSettings.server'
import { sortPrintVariants } from '@/lib/printImages'
import { isPrintId } from '@/lib/printManager'
import { getArtworkBySku } from '@/lib/artworks'
import { getPrintMediaMap } from '@/lib/printMedia.server'
import ArtworkDetailClient from './ArtworkDetailClient'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { serviceClient } from '@/lib/offersAuth'
import { socialContext } from '@/lib/social/data.server'

import { artworkJsonLd } from '@/lib/seo'
import { getPublicPrintArtworks } from '@/lib/publicPrintDiscovery.server'
import { legacyArtworkPrintCountries, commercialArtworkPrintCountries } from '@/lib/artworkDetailPresentation'
import { isShareablePrint } from '@/lib/social/print'

export const isVersionDraft = artwork => artwork?.version_kind === 'SUCCESSOR' && !artwork.version_published_at

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

export default async function ArtworkDetailPage({ sku, print, printPage = false, legacyPrint = false, country = null }) {
  country = await requestMarketCountry(country)
  const artwork = await getArtworkBySku(sku)

  if (!artwork || isVersionDraft(artwork)) notFound()

  const initialPrintId = isPrintId(print) ? print.toLowerCase() : undefined
  if (printPage && !artwork.allows_prints) notFound()
  if (printPage && artwork.artwork_prints?.some(isShareablePrint) &&
      !await getPublicPrintArtworks([artwork.id]).then(rows => rows.length > 0).catch(() => false)) notFound()

  const versions = 'is_historical_version' in artwork ? await getPublicVersions(artwork.id) : []
  if (artwork.is_historical_version && !versions.some(row => !row.is_historical_version)) notFound()
  artwork.version_family = versions.length > 1 ? versions : []

  if (!printPage) artwork.provenance_events = await getServerProvenance(artwork.id, artwork.provenance_events || [])
  // Resolve public image references once on the server, never from client URLs.
  let media
  try {
    const db = serviceClient()
    const map = await getPrintMediaMap(db, [artwork], artwork.artwork_prints || [], { includeInactive: true })
    media = map[artwork.id]
    if (artwork.allows_prints && artwork.print_price_mxn > 0 && !artwork.artwork_prints?.length) {
      const { data, error } = await db.from('artwork_prints').select('id')
        .eq('artwork_id', artwork.id).not('title', 'is', null).limit(1)
      artwork.has_managed_prints = !error && Boolean(data?.length)
    }
  } catch (error) {
    console.error('[artwork] print media lookup unavailable:', error?.code || error?.message)
  }
  artwork.original_image_url = originalArtworkImage(artwork, media?.gallery)
  artwork.original_media_rows = media?.gallery || []
  artwork.print_media = { firstFlagged: media?.firstFlagged || null }
  const publicImages = new Map(media?.variants.map(variant => [variant.id, variant.resolved_print_image_url]))
  artwork.artwork_prints = sortPrintVariants(artwork.artwork_prints || []).map(v => ({
    id: v.id, is_active: v.is_active, title: v.title, title_en: v.title_en, description: v.description, description_en: v.description_en,
    size: v.size, finish: v.finish, paper_type: v.paper_type, framing: v.framing, price: v.price,
    edition_type: v.edition_type, max_edition_size: v.max_edition_size, prints_sold: v.prints_sold,
    edition_size: v.edition_size, print_limit: v.print_limit, is_available: v.is_available,
    allowed_shipping_countries: v.allowed_shipping_countries, shipping_policy_ids: v.shipping_policy_ids,
    gallery_images: v.gallery_images,
    resolved_print_image_url: publicImages.get(v.id) || v.image_url || null,
  }))


  // Canal de consulta de precio (migración 20261103); si falta, WhatsApp por defecto.
  let siteSettings = null
  try {
    const { data } = await supabase.from('site_settings').select('inquiry_channel, whatsapp_number').eq('id', true).maybeSingle()
    siteSettings = data || null
  } catch {
    siteSettings = null
  }

  const social = printPage ? null : await socialContext(artwork).catch(() => null)

  const db = serviceClient()
  const [shippingConfig, commentsEnabled] = await Promise.all([
    loadShippingSettings(db).catch(() => ({ globalCountries: [] })),
    artworkDiscussionsEnabled(db, artwork.id).catch(() => false),
  ])
  artwork.effective_shipping_countries=withShippingCountries(artwork,shippingConfig).effective_shipping_countries
  artwork.artwork_prints=(artwork.artwork_prints||[]).map(v=>withShippingCountries(v,shippingConfig,artwork))

  const commercial = (printPage || artwork.allows_prints)
    ? await loadFineArtVariants(db,shippingConfig,{ artworkIds:[artwork.id] }).then(rows=>rows.map(fineArtPublic)).catch(()=>[])
    : []
  if (printPage && commercial.length && !legacyPrint && !artwork.artwork_prints.some(isShareablePrint)) {
    return <CommercialPresentations variants={commercial} title={artwork.title} initialId={initialPrintId} country={country} />
  }
  if (printPage) return <>
    {commercial.length > 0 && !legacyPrint && <CommercialPresentations variants={commercial} title={artwork.title}
      initialId={initialPrintId} country={country} />}
    <PrintDetail commercial={legacyPrint ? [] : commercial} artwork={{
    id: artwork.id, sku: artwork.sku, title: artwork.title, title_en: artwork.title_en,
    primary_image_url: artwork.original_image_url, print_media: artwork.print_media,
    artwork_prints: artwork.artwork_prints, allows_prints: artwork.allows_prints,
    has_managed_prints: artwork.has_managed_prints, print_price_mxn: artwork.print_price_mxn,
    print_type: artwork.print_type, prints_sold: artwork.prints_sold, print_edition_size: artwork.print_edition_size,
    allowed_shipping_countries: artwork.allowed_shipping_countries, shipping_policy_ids: artwork.shipping_policy_ids,
    effective_shipping_countries: artwork.effective_shipping_countries,
  }} initialVariant={initialPrintId} country={country}
    siteSettings={siteSettings} commentsEnabled={commentsEnabled} legacy={legacyPrint} guestPrintCheckout={process.env.ENABLE_GUEST_OPEN_EDITION_CHECKOUT === 'true'} />
  </>

  // Reuse the public storefront loader; send only eligible destinations to the
  // artwork action, not provider/configuration/production data.
  const legacyCountries=legacyArtworkPrintCountries(artwork)
  const legacyPublic=legacyCountries.length ? await getPublicPrintArtworks([artwork.id])
    .then(rows=>rows.some(row=>row.id===artwork.id)).catch(()=>false) : false
  const printCountries=[...new Set([...commercialArtworkPrintCountries(commercial),...(legacyPublic ? legacyCountries : [])])]

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(artworkJsonLd(artwork)).replace(/</g, '\\u003c') }} />
    <ArtworkDetailClient key={sku} printCountries={printCountries} country={country} artwork={artwork} siteSettings={siteSettings} commentsEnabled={commentsEnabled}
      social={social ? { ...social, titleEn: artwork.title_en || '' } : null} />
  </>
}
