import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'
import { socialConfig, socialPresentation } from './config.js'

function publicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export const loadSocialSettings = unstable_cache(async () => {
  const db = publicDb()
  if (!db) return { config: socialConfig(), primaryArtist: null }
  const { data, error } = await db.from('site_settings').select('social_sharing, primary_artist_profile_id, updated_at').eq('id', true).maybeSingle()
  // The missing additive column must not disable existing artist identity.
  let row = data
  if (error) {
    const fallback = await db.from('site_settings').select('primary_artist_profile_id').eq('id', true).maybeSingle()
    row = fallback.data
  }
  return { config: socialConfig(row?.social_sharing), primaryArtist: row?.primary_artist_profile_id || null, revision: row?.updated_at || '' }
}, ['social-settings-v1'], { revalidate: 60, tags: ['social-settings'] })

export const loadSocialArtwork = unstable_cache(async (sku) => {
  const db = publicDb()
  if (!db) return null
  // Narrow public projection; never load prices, collector identities or certificates.
  const { data, error } = await db.from('artworks').select('sku,title,title_en,medium,medium_en,year,dimensions,primary_image_url,artist_profile_id,updated_at').eq('sku', sku).maybeSingle()
  if (error) {
    // English fields are optional, but preserve artist identity and revisions.
    const fallback = await db.from('artworks').select('sku,title,medium,year,dimensions,primary_image_url,artist_profile_id,updated_at').eq('sku', sku).maybeSingle()
    if (!fallback.error) return fallback.data || null
    const legacy = await db.from('artworks').select('sku,title,medium,year,dimensions,primary_image_url').eq('sku', sku).maybeSingle()
    return legacy.data || null
  }
  return data || null
}, ['social-artwork-v1'], { revalidate: 60 })

export const loadSocialArtist = unstable_cache(async (profileId) => {
  if (!profileId) return ''
  const db = publicDb()
  if (!db) return ''
  // Only the public editorial profile, never public reads of private profiles.
  const { data } = await db.from('artist_profiles').select('display_name').eq('profile_id', profileId).eq('about_enabled', true).maybeSingle()
  return data?.display_name || ''
}, ['social-artist-v1'], { revalidate: 60 })

export async function socialContext(artwork, locale = 'es') {
  const { config, primaryArtist, revision } = await loadSocialSettings()
  const artist = await loadSocialArtist(artwork?.artist_profile_id || primaryArtist)
  const presentation = socialPresentation(artwork, config, artist, locale)
  const version = createHash('sha256').update(JSON.stringify({ config, presentation, image: artwork?.primary_image_url, updated: artwork?.updated_at, settingsRevision: revision })).digest('hex').slice(0, 16)
  return { config, presentation, version }
}
