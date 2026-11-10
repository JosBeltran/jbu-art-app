import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { promotionalMetadata, findSeriesBySlug, seriesSlug } from './promotional.js'
import { getArtworks } from '../artworks.js'
import { effectiveStatus, belongsToSeries } from '../homeSeries.js'

// Public metadata must not depend on session cookies or client hydration.
function publicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }) } })
}
export async function promotionalConfig() {
  const db = publicDb()
  if (!db) return { pages: {}, series: {}, revision: '' }
  const { data } = await db.from('site_settings').select('social_sharing,updated_at').eq('id', true).maybeSingle()
  return {
    pages: data?.social_sharing?.promotionalPages || {},
    series: data?.social_sharing?.promotionalSeries || {},
    revision: data?.updated_at || '',
  }
}
export async function publicSeriesRows() {
  const db = publicDb()
  if (!db) {
    console.error('[promotional-series] missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    throw new Error('public_series_configuration_missing')
  }
  const { data, error } = await db.from('series').select('*')
  if (error) {
    // A configuration/permission failure is not a 404. Do not silently
    // hide every series when the Preview's Supabase environment is wrong.
    console.error('[promotional-series] public series fetch failed', {
      code: error.code, message: error.message,
    })
    throw new Error('public_series_unavailable')
  }
  return (data || []).filter(s => ['active', 'outlet'].includes(effectiveStatus(s)))
}
export async function seriesPageData(slug) {
  const seriesRows = await publicSeriesRows()
  const series = findSeriesBySlug(seriesRows, slug)
  if (!series) return null
  // getArtworks already applies the same public Series visibility rules as Catalog/Home.
  const artworks = (await getArtworks()).filter(a => belongsToSeries(a, series))
  return { series, seriesRows, artworks }
}
export async function promotionalPageMetadata(kind, opts = {}) {
  const settings = await promotionalConfig()
  if (kind === 'series') {
    const seriesRows = await publicSeriesRows()
    const series = findSeriesBySlug(seriesRows, opts.slug)
    if (!series) return null
    let mainImage = series.teaser_image_url || ''
    if (series.main_artwork_id) {
      const [artwork] = await getArtworks({ ids: [series.main_artwork_id] })
      mainImage = artwork?.primary_image_url || mainImage
    }
    return promotionalMetadata({
      kind, path: '/series/' + encodeURIComponent(seriesSlug(series)),
      settings: settings.series[String(series.id)] || {},
      series, mainImage, revision: settings.revision, language: opts.language,
    })
  }
  return promotionalMetadata({
    kind, path: '/' + kind, settings: settings.pages[kind] || {},
    revision: settings.revision, language: opts.language,
  })
}
