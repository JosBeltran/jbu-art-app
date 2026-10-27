import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { resolvePrimaryArtist, aboutMetaTitle, aboutMetaDescription, artistField } from '@/lib/artistProfile'
import { SITE_URL, SHARE_IMAGE } from '@/lib/seo'
import ArtistAbout from './ArtistAbout'

export const revalidate = 0

/** Artista principal configurado y con About activado; null si no aplica. */
async function getPrimaryArtist() {
  try {
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('primary_artist_profile_id')
      .eq('id', true)
      .maybeSingle()
    if (settingsError || !settings?.primary_artist_profile_id) return null
    const { data, error } = await supabase
      .from('artist_profiles')
      .select('*')
      .eq('profile_id', settings.primary_artist_profile_id)
      .eq('about_enabled', true)
      .maybeSingle()
    if (error) return null
    return resolvePrimaryArtist({ settings, artists: data ? [data] : [] })
  } catch {
    return null
  }
}

export async function generateMetadata() {
  const artist = await getPrimaryArtist()
  if (!artist) return { title: 'About' }
  // Metadatos en español e inglés generados desde el perfil (sin contenido fijo).
  const title = aboutMetaTitle(artist, 'es')
  const description = aboutMetaDescription(artist, 'es')
  const titleEn = aboutMetaTitle(artist, 'en')
  const descriptionEn = aboutMetaDescription(artist, 'en')
  const image = artist.profile_image_url || SHARE_IMAGE
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE_URL}/about` },
    openGraph: {
      type: 'profile',
      url: `${SITE_URL}/about`,
      siteName: artist.display_name,
      title: titleEn || title,
      description: descriptionEn || description,
      images: [{ url: image }],
    },
    twitter: { card: 'summary_large_image', title: titleEn || title, description: descriptionEn || description, images: [image] },
  }
}

export default async function AboutPage() {
  const artist = await getPrimaryArtist()
  if (!artist) notFound()
  const location = artistField(artist, 'location', 'es')
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: `${SITE_URL}/about`,
    name: aboutMetaTitle(artist, 'es'),
    mainEntity: {
      '@type': 'Person',
      '@id': `${SITE_URL}/#artist`,
      name: artist.display_name,
      ...(artist.profile_image_url ? { image: artist.profile_image_url } : {}),
      ...(location ? { address: { '@type': 'PostalAddress', addressLocality: location.split(',')[0].trim(), addressCountry: 'MX' } } : {}),
    },
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ArtistAbout artist={artist} />
    </>
  )
}
