import type { MetadataRoute } from 'next'
import { getArtworks } from '@/lib/artworks'
import { SITE_URL } from '@/lib/seo'
import { publicSeriesRows } from '@/lib/social/promotional.server'
import { seriesSlug } from '@/lib/social/promotional'

export const revalidate = 3600

// Solo URLs públicas: getArtworks ya excluye borradores y obras de Series próximas o archivadas.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/catalog`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/prints`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/como-funciona`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/info/soporte`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/cookies`, changeFrequency: 'yearly', priority: 0.1 },
  ]
  let artworks: any[] = []
  try { artworks = (await getArtworks()) || [] } catch { artworks = [] }
  const works: MetadataRoute.Sitemap = artworks
    .filter((a) => a?.sku)
    .map((a) => ({
      url: `${SITE_URL}/artwork/${encodeURIComponent(a.sku)}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : undefined,
      changeFrequency: 'monthly',
      priority: 0.7,
      images: a.primary_image_url ? [a.primary_image_url] : undefined,
    }))
  let series = []
  try { series = await publicSeriesRows() } catch { series = [] }
  const seriesUrls: MetadataRoute.Sitemap = series.filter((s) => seriesSlug(s)).map((s) => ({
    url: `${SITE_URL}/series/${encodeURIComponent(seriesSlug(s))}`,
    changeFrequency: 'monthly', priority: 0.7,
  }))
  return [...pages, ...seriesUrls, ...works]
}
