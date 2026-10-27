'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button, InlineLoading, InlineNotification, TextArea, TextInput, Toggle } from '@carbon/react'
import { Save } from '@carbon/icons-react'
import ImageUploader from '../artworks/components/ImageUploader'
import { useI18n } from '@/components/I18nProvider'
import { validateArtistProfile } from '@/lib/artistProfile'
import styles from '../artworks/[id]/edit/EditArtwork.module.css'

const EMPTY = {
  display_name: '',
  location_es: '',
  location_en: '',
  about_title_es: '',
  about_title_en: '',
  biography_es: '',
  biography_en: '',
  profile_image_url: '',
  contact_email: '',
  website_url: '',
  instagram_url: '',
  about_enabled: false,
}

/**
 * Perfil del artista (contenido de la página About). Edita el artista
 * principal configurado en site_settings; el diseño público lo controla la
 * plataforma. Si faltan las tablas, avisa qué migración aplicar.
 */
export default function AdminArtistPage() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [tablesReady, setTablesReady] = useState(true)
  const [configured, setConfigured] = useState(true)
  const [profileId, setProfileId] = useState(null)
  const [draft, setDraft] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data: settings, error: settingsError } = await supabase
      .from('site_settings')
      .select('primary_artist_profile_id')
      .eq('id', true)
      .maybeSingle()
    if (settingsError) {
      setTablesReady(false)
      setLoading(false)
      return
    }
    const id = settings?.primary_artist_profile_id
    if (!id) {
      setConfigured(false)
      setLoading(false)
      return
    }
    setProfileId(id)
    const { data, error } = await supabase.from('artist_profiles').select('*').eq('profile_id', id).maybeSingle()
    if (error) {
      setTablesReady(false)
      setLoading(false)
      return
    }
    setDraft({ ...EMPTY, ...(data || {}) })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const set = (field) => (eventOrValue) => {
    const value = eventOrValue?.target ? eventOrValue.target.value : eventOrValue
    setDraft((d) => ({ ...d, [field]: value }))
  }

  const save = async () => {
    const validation = validateArtistProfile(draft)
    if (!validation.ok) {
      setNotice({
        kind: 'error',
        text: validation.errors.display_name
          ? t('El nombre del artista es obligatorio.', 'The artist display name is required.')
          : t('Revisa el correo y las URLs: deben tener formato válido (https://…).', 'Check the email and URLs: they must be valid (https://…).'),
      })
      return
    }
    setSaving(true)
    const payload = {
      profile_id: profileId,
      display_name: draft.display_name.trim(),
      location_es: draft.location_es?.trim() || null,
      location_en: draft.location_en?.trim() || null,
      about_title_es: draft.about_title_es?.trim() || null,
      about_title_en: draft.about_title_en?.trim() || null,
      biography_es: draft.biography_es?.trim() || null,
      biography_en: draft.biography_en?.trim() || null,
      profile_image_url: draft.profile_image_url?.trim() || null,
      contact_email: draft.contact_email?.trim() || null,
      website_url: draft.website_url?.trim() || null,
      instagram_url: draft.instagram_url?.trim() || null,
      about_enabled: draft.about_enabled === true,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('artist_profiles').upsert(payload, { onConflict: 'profile_id' })
    setSaving(false)
    setNotice(error
      ? { kind: 'error', text: `${t('No se pudo guardar el perfil', 'Could not save the profile')}: ${error.message}` }
      : { kind: 'success', text: t('Perfil del artista guardado.', 'Artist profile saved.') })
  }

  if (loading) {
    return <InlineLoading description={t('Cargando perfil del artista…', 'Loading artist profile…')} />
  }

  if (!tablesReady) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title={t('Perfil del artista', 'Artist profile')}
        subtitle={t('Aplica la migración 20261106_artist_profiles.sql para configurar el perfil. Mientras tanto, la página About no se muestra.', 'Apply migration 20261106_artist_profiles.sql to configure the profile. Meanwhile, the About page is not shown.')}
      />
    )
  }

  if (!configured) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title={t('Perfil del artista', 'Artist profile')}
        subtitle={t('No hay un artista principal configurado. Aplica la migración 20261106_artist_profiles.sql: vincula el perfil actual automáticamente.', 'No primary artist is configured. Apply migration 20261106_artist_profiles.sql: it links the current profile automatically.')}
      />
    )
  }

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 className={styles.pageTitle || ''}>{t('Perfil del artista', 'Artist profile')}</h1>
        <p className={styles.sectionHelp}>
          {t(
            'Contenido de la página pública About. El diseño lo controla la plataforma; aquí solo se edita el contenido, en español e inglés.',
            'Content of the public About page. The platform controls the design; only the content is edited here, in Spanish and English.'
          )}
        </p>
      </header>

      {notice && (
        <InlineNotification
          kind={notice.kind}
          lowContrast
          title={t('Perfil del artista', 'Artist profile')}
          subtitle={notice.text}
          onCloseButtonClick={() => setNotice(null)}
          style={{ marginBottom: '1rem' }}
        />
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><h2 className={styles.sectionTitle}>{t('Identidad', 'Identity')}</h2></div>
        </div>
        <div style={{ display: 'grid', gap: '1rem', maxWidth: '40rem' }}>
          <TextInput
            id="artist-display-name"
            labelText={t('Nombre público', 'Display name')}
            value={draft.display_name}
            onChange={set('display_name')}
            required
          />
          <TextInput
            id="artist-location-es"
            labelText={t('Ubicación (ES)', 'Location (ES)')}
            value={draft.location_es || ''}
            onChange={set('location_es')}
            placeholder="Monterrey, Nuevo León, México"
          />
          <TextInput
            id="artist-location-en"
            labelText={t('Ubicación (EN)', 'Location (EN)')}
            value={draft.location_en || ''}
            onChange={set('location_en')}
            placeholder="Monterrey, Nuevo León, Mexico"
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Contenido About', 'About content')}</h2>
            <p className={styles.sectionHelp}>
              {t('Los párrafos se separan con una línea en blanco y se muestran tal cual en la página.', 'Paragraphs are separated by a blank line and render exactly as entered.')}
            </p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: '1rem', maxWidth: '48rem' }}>
          <TextInput
            id="artist-title-es"
            labelText={t('Título About (ES)', 'About title (ES)')}
            value={draft.about_title_es || ''}
            onChange={set('about_title_es')}
            placeholder="Sobre mi práctica"
          />
          <TextArea
            id="artist-bio-es"
            labelText={t('Biografía (ES)', 'Biography (ES)')}
            value={draft.biography_es || ''}
            onChange={set('biography_es')}
            rows={10}
          />
          <TextInput
            id="artist-title-en"
            labelText={t('Título About (EN)', 'About title (EN)')}
            value={draft.about_title_en || ''}
            onChange={set('about_title_en')}
            placeholder="About my practice"
          />
          <TextArea
            id="artist-bio-en"
            labelText={t('Biografía (EN)', 'Biography (EN)')}
            value={draft.biography_en || ''}
            onChange={set('biography_en')}
            rows={10}
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Imagen', 'Image')}</h2>
            <p className={styles.sectionHelp}>
              {t('Retrato o foto de estudio. Si no hay imagen, la página About solo muestra el texto.', 'Portrait or studio photo. Without an image, the About page shows text only.')}
            </p>
          </div>
        </div>
        <div style={{ maxWidth: '24rem' }}>
          <ImageUploader
            currentUrl={draft.profile_image_url || ''}
            pathPrefix={`artists/${profileId}/profile`}
            onUploadComplete={(url) => setDraft((d) => ({ ...d, profile_image_url: url }))}
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><h2 className={styles.sectionTitle}>{t('Contacto', 'Contact')}</h2></div>
        </div>
        <div style={{ display: 'grid', gap: '1rem', maxWidth: '40rem' }}>
          <TextInput
            id="artist-contact-email"
            type="email"
            labelText={t('Correo de contacto', 'Contact email')}
            value={draft.contact_email || ''}
            onChange={set('contact_email')}
            invalid={Boolean(draft.contact_email) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.contact_email.trim())}
            invalidText={t('Correo con formato no válido.', 'Invalid email format.')}
          />
          <TextInput
            id="artist-website"
            labelText={t('Sitio web (opcional)', 'Website (optional)')}
            value={draft.website_url || ''}
            onChange={set('website_url')}
            placeholder="https://…"
          />
          <TextInput
            id="artist-instagram"
            labelText="Instagram (opcional)"
            value={draft.instagram_url || ''}
            onChange={set('instagram_url')}
            placeholder="https://instagram.com/…"
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><h2 className={styles.sectionTitle}>{t('Visibilidad', 'Visibility')}</h2></div>
        </div>
        <Toggle
          id="artist-about-enabled"
          labelText={t('Mostrar sección About', 'Show About section')}
          labelA={t('Oculta', 'Hidden')}
          labelB={t('Visible', 'Visible')}
          toggled={draft.about_enabled === true}
          onToggle={(checked) => setDraft((d) => ({ ...d, about_enabled: checked }))}
        />
      </section>

      <div style={{ marginTop: '2rem' }}>
        <Button type="button" renderIcon={Save} onClick={save} disabled={saving}>
          {saving ? t('Guardando…', 'Saving…') : t('Guardar perfil', 'Save profile')}
        </Button>
      </div>
    </div>
  )
}
