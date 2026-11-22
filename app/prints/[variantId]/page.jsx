import { serviceClient } from '@/lib/offersAuth'
import { loadShippingSettings } from '@/lib/shippingSettings.server'
import { loadFineArtVariants } from '@/lib/productCatalog/commerce.server'
import { notFound } from 'next/navigation'
import ArtworkDetailPage from '@/app/artwork/[sku]/ArtworkDetailPage'
import { getArtworkBySku } from '@/lib/artworks'
import { loadSharedPrint, sharedPrintContext } from '@/lib/social/print.server'
import { isShareablePrint, printShareLanguage, printSocialMetadata } from '@/lib/social/print'
import { isPrintId } from '@/lib/printManager'
import { artworkPrintHref } from '@/lib/printRoutes'
import { SITE_URL } from '@/lib/seo'

export const revalidate = 0

export async function generateMetadata({ params, searchParams }) {
  const { variantId: identifier } = await params
  const { lang, variant } = await searchParams
  const language = printShareLanguage(lang)
  const legacy = isPrintId(identifier)
  const artwork = legacy ? null : await getArtworkBySku(identifier)
  const id = legacy ? identifier : artwork?.artwork_prints?.find(row => row.id === variant && isShareablePrint(row))?.id ||
    artwork?.artwork_prints?.find(isShareablePrint)?.id
  const context = id ? await sharedPrintContext(id, language) : null
  if (!context && artwork?.allows_prints) {
    try {
      const db = serviceClient()
      const variants = await loadFineArtVariants(db,await loadShippingSettings(db),{ artworkIds:[artwork.id] })
      const commercial = variants.find(row=>row.id === variant) || variants[0]
      if (commercial) {
        const title = (language === 'en' ? artwork.title_en || artwork.title : artwork.title) + ' | Fine Art Prints'
        const description = language === 'en' ? commercial.descriptionEn : commercial.description
        const canonical = SITE_URL + artworkPrintHref(artwork.sku)
        return { title,description,alternates:{ canonical,languages:{ es:canonical+'?lang=es',en:canonical+'?lang=en' } },
          openGraph:{ title,description,url:canonical,images:[{ url:commercial.cover || commercial.gallery[0].url,
            alt:language === 'en' ? commercial.gallery[0].altEn : commercial.gallery[0].altEs }] } }
      }
    } catch { /* Before rollout and during a provider-independent catalog failure, preserve legacy metadata. */ }
  }
  if (!context) return { title: artwork ? artwork.title + ' | Fine Art Prints' : 'Fine Art Prints', robots: { index: false } }
  const meta = printSocialMetadata(context.presentation, context.variant.id, context.revision)
  const canonical = SITE_URL + artworkPrintHref(context.artwork.sku)
  const variantUrl = SITE_URL + artworkPrintHref(context.artwork.sku, { variant: context.variant.id, lang: language })
  return {
    ...meta,
    alternates: { canonical, languages: { es: canonical + '?lang=es', en: canonical + '?lang=en' } },
    openGraph: { ...meta.openGraph, url: legacy ? meta.openGraph.url : variantUrl },
  }
}

export default async function PrintPage({ params, searchParams }) {
  const { variantId: identifier } = await params
  const query = await searchParams
  if (!isPrintId(identifier)) return <ArtworkDetailPage sku={identifier} print={query.variant} country={query.country} printPage />
  const print = await loadSharedPrint(identifier.toLowerCase())
  if (!print) notFound()
  return <ArtworkDetailPage sku={print.artwork.sku} print={print.variant.id} country={query.country} printPage legacyPrint />
}
