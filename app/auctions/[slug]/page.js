import { createClient } from '@supabase/supabase-js'
import AuctionEventClient from './AuctionEventClient'

export const revalidate = 0

const SITE = 'https://www.josuebeltranuresti.com'

async function getEvent(slug) {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data } = await sb.from('auction_events_public').select('name, subtitle, description, cover_image_url, slug').eq('slug', slug).maybeSingle()
    return data || null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const event = await getEvent(slug)
  if (!event) return { title: 'Subasta | Estudio JBU' }
  const title = `${event.name} | Subasta JBU`
  const description = String(event.description || event.subtitle || `Subasta en línea de obras originales de Josué Beltrán Uresti.`).slice(0, 160)
  const url = `${SITE}/auctions/${event.slug}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: event.cover_image_url ? [event.cover_image_url] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: event.cover_image_url ? [event.cover_image_url] : undefined },
  }
}

export default async function AuctionEventPage({ params }) {
  const { slug } = await params
  return <AuctionEventClient slug={slug} />
}
