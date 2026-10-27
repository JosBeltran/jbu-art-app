'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { JBUPageHeader, JBUSection } from '@/components/jbu/JBUEditorial'
import { artistField, splitParagraphs } from '@/lib/artistProfile'
import styles from './About.module.css'

/**
 * Perfil editorial del artista. El diseño lo controla la plataforma; el
 * contenido llega completo por `artist` (artist_profiles). Sin imagen
 * configurada, el texto ocupa el espacio naturalmente (sin avatar ni stock).
 */
export default function ArtistAbout({ artist }) {
  const { t, lang } = useI18n()
  if (!artist) return null

  const name = artist.display_name
  const location = artistField(artist, 'location', lang)
  const title = artistField(artist, 'about_title', lang)
  const paragraphs = splitParagraphs(artistField(artist, 'biography', lang))
  const hasImage = Boolean(artist.profile_image_url)

  const meta = [
    location && { key: t('Estudio', 'Studio'), value: location },
    artist.contact_email && {
      key: t('Contacto directo', 'Direct contact'),
      value: <a href={`mailto:${artist.contact_email}`} className={styles.metaLink}>{artist.contact_email}</a>,
    },
    artist.website_url && {
      key: t('Sitio web', 'Website'),
      value: <a href={artist.website_url} target="_blank" rel="noreferrer" className={styles.metaLink}>{artist.website_url.replace(/^https?:\/\//, '')}</a>,
    },
    artist.instagram_url && {
      key: 'Instagram',
      value: <a href={artist.instagram_url} target="_blank" rel="noreferrer" className={styles.metaLink}>{artist.instagram_url.replace(/^https?:\/\//, '')}</a>,
    },
  ].filter(Boolean)

  return (
    <div className={styles.page}>
      <JBUPageHeader
        label={t('El artista', 'The artist')}
        title={name}
        intro={location ? t(`Artista contemporáneo · ${location}`, `Contemporary artist · ${location}`) : undefined}
      />

      <JBUSection className={styles.profileSection}>
        <div className={`${styles.profileGrid} ${hasImage ? '' : styles.profileGridNoImage}`}>
          {hasImage && (
            <figure className={styles.portrait}>
              <Image
                src={artist.profile_image_url}
                alt={t(`Retrato de ${name}`, `Portrait of ${name}`)}
                width={1200}
                height={1500}
                sizes="(max-width: 671px) 100vw, 40vw"
                quality={85}
                className={styles.portraitImage}
                priority
              />
            </figure>
          )}

          <div className={styles.editorial}>
            {title && <h2 className={styles.aboutTitle}>{title}</h2>}
            <div className={styles.biography}>
              {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
            </div>

            {meta.length > 0 && (
              <dl className={styles.meta}>
                {meta.map((item) => (
                  <div key={item.key} className={styles.metaItem}>
                    <dt className={styles.metaKey}>{item.key}</dt>
                    <dd className={styles.metaValue}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <Link href="/catalog" className={styles.cta}>
              {t('Explorar las obras', 'Explore the work')}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
      </JBUSection>
    </div>
  )
}
