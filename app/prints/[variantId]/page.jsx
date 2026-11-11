import { notFound } from 'next/navigation'
import ArtworkDetailPage from '@/app/artwork/[sku]/ArtworkDetailPage'
import { loadSharedPrint, sharedPrintContext } from '@/lib/social/print.server'
import { printShareLanguage, printSocialMetadata } from '@/lib/social/print'

export const revalidate = 0

export async function generateMetadata({ params, searchParams }) {
  const { variantId } = await params
  const { lang } = await searchParams
  const language = printShareLanguage(lang)
  const context = await sharedPrintContext(variantId, language)
  if (!context) return { title: language === 'en' ? 'Print unavailable' : 'Impresión no disponible', robots: { index: false } }
  return printSocialMetadata(context.presentation, context.variant.id, context.revision)
}

export default async function PrintPage({ params, searchParams }) {
  const { variantId } = await params
  const query = await searchParams
  const print = await loadSharedPrint(variantId)
  if (!print) notFound()
  return <ArtworkDetailPage sku={print.artwork.sku} print={print.variant.id} country={query?.country} sharedPrint />
}
