'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  Tag,
  TextInput,
  Toggle,
} from '@carbon/react'
import { Add, ArrowDown, ArrowUp, TrashCan } from '@carbon/icons-react'
import ImageUploader from '@/app/admin/artworks/components/ImageUploader'
import VideoUploader from '@/app/admin/artworks/components/VideoUploader'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/admin/artworks/[id]/edit/EditArtwork.module.css'

const EMPTY_SLIDE = {
  kind: 'IMAGE',
  url: '',
  poster_url: '',
  title_es: '',
  title_en: '',
  description_es: '',
  description_en: '',
  link_url: '',
  cta_es: '',
  cta_en: '',
  position: 0,
  enabled: true,
}

/**
 * Estudio del Hero de portada. Se usa dentro de Admin > Home.
 *
 * Modo FEATURED conserva la lógica actual (obras destacadas). IMAGES y
 * VIDEOS usan los elementos personalizados de abajo; si el modo elegido no
 * tiene elementos activos, la portada cae a FEATURED automáticamente.
 */
export default function HeroStudio() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [tablesReady, setTablesReady] = useState(true)
  const [mode, setMode] = useState('FEATURED')
  const [slides, setSlides] = useState([])
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY_SLIDE)
  const [editingId, setEditingId] = useState(null)

  const load = async () => {
    setLoading(true)
    const [settingsRes, slidesRes] = await Promise.all([
      supabase.from('hero_settings').select('*').eq('id', true).maybeSingle(),
      supabase.from('hero_slides').select('*').order('position', { ascending: true }),
    ])
    if (settingsRes.error || slidesRes.error) {
      setTablesReady(false)
      setLoading(false)
      return
    }
    setTablesReady(true)
    setMode(settingsRes.data?.mode || 'FEATURED')
    setSlides(slidesRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const saveMode = async (nextMode) => {
    setMode(nextMode)
    setSaving(true)
    const { error } = await supabase
      .from('hero_settings')
      .upsert({ id: true, mode: nextMode, updated_at: new Date().toISOString() })
    setSaving(false)
    setNotice(error
      ? { kind: 'error', text: `${t('No se pudo guardar el modo', 'Could not save the mode')}: ${error.message}` }
      : { kind: 'success', text: t('Modo del Hero guardado.', 'Hero mode saved.') })
  }

  const openNew = (kind) => {
    setEditingId(null)
    setDraft({ ...EMPTY_SLIDE, kind, position: slides.length })
    setModalOpen(true)
  }

  const openEdit = (slide) => {
    setEditingId(slide.id)
    setDraft({ ...EMPTY_SLIDE, ...slide })
    setModalOpen(true)
  }

  const saveSlide = async () => {
    if (!draft.url.trim()) {
      setNotice({ kind: 'error', text: t('El elemento necesita una imagen o un video.', 'The slide needs an image or a video.') })
      return
    }
    setSaving(true)
    const payload = {
      kind: draft.kind,
      url: draft.url.trim(),
      poster_url: draft.poster_url?.trim() || null,
      title_es: draft.title_es?.trim() || null,
      title_en: draft.title_en?.trim() || null,
      description_es: draft.description_es?.trim() || null,
      description_en: draft.description_en?.trim() || null,
      link_url: draft.link_url?.trim() || null,
      cta_es: draft.cta_es?.trim() || null,
      cta_en: draft.cta_en?.trim() || null,
      position: Number(draft.position) || 0,
      enabled: draft.enabled !== false,
      updated_at: new Date().toISOString(),
    }
    const { error } = editingId
      ? await supabase.from('hero_slides').update(payload).eq('id', editingId)
      : await supabase.from('hero_slides').insert(payload)
    setSaving(false)
    if (error) {
      setNotice({ kind: 'error', text: `${t('No se pudo guardar el elemento', 'Could not save the slide')}: ${error.message}` })
      return
    }
    setModalOpen(false)
    setNotice({ kind: 'success', text: t('Elemento guardado.', 'Slide saved.') })
    load()
  }

  const removeSlide = async (slide) => {
    if (!window.confirm(t('¿Eliminar este elemento del Hero?', 'Delete this Hero slide?'))) return
    const { error } = await supabase.from('hero_slides').delete().eq('id', slide.id)
    setNotice(error
      ? { kind: 'error', text: `${t('No se pudo eliminar', 'Could not delete')}: ${error.message}` }
      : { kind: 'success', text: t('Elemento eliminado.', 'Slide deleted.') })
    if (!error) load()
  }

  const toggleSlide = async (slide) => {
    await supabase.from('hero_slides').update({ enabled: !slide.enabled, updated_at: new Date().toISOString() }).eq('id', slide.id)
    load()
  }

  const moveSlide = async (slide, dir) => {
    const siblings = slides.filter((s) => s.kind === slide.kind).sort((a, b) => a.position - b.position)
    const idx = siblings.findIndex((s) => s.id === slide.id)
    const other = siblings[idx + dir]
    if (!other) return
    await Promise.all([
      supabase.from('hero_slides').update({ position: other.position }).eq('id', slide.id),
      supabase.from('hero_slides').update({ position: slide.position }).eq('id', other.id),
    ])
    load()
  }

  if (loading) {
    return <InlineLoading description={t('Cargando configuración del Hero…', 'Loading Hero settings…')} />
  }

  if (!tablesReady) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title={t('Hero de portada', 'Home hero')}
        subtitle={t('Aplica la migración 20261103_hero_and_price_display.sql para configurar el Hero. Mientras tanto, la portada usa las obras destacadas como siempre.', 'Apply migration 20261103_hero_and_price_display.sql to configure the Hero. Meanwhile, the home page uses featured artworks as usual.')}
      />
    )
  }

  const kinds = ['IMAGE', 'VIDEO']

  return (
    <div>
      {notice && (
        <InlineNotification
          kind={notice.kind}
          lowContrast
          title={t('Hero de portada', 'Home hero')}
          subtitle={notice.text}
          onCloseButtonClick={() => setNotice(null)}
          style={{ marginBottom: '1rem' }}
        />
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div><h2 className={styles.sectionTitle}>{t('Modo del Hero', 'Hero mode')}</h2></div>
        </div>
        <RadioButtonGroup
          legendText={t('Fuente del contenido', 'Content source')}
          name="hero-mode"
          valueSelected={mode}
          disabled={saving}
          onChange={saveMode}
        >
          <RadioButton id="hero-mode-featured" value="FEATURED" labelText={t('Obras destacadas (actual)', 'Featured artworks (current)')} />
          <RadioButton id="hero-mode-images" value="IMAGES" labelText={t('Imágenes personalizadas', 'Custom images')} />
          <RadioButton id="hero-mode-videos" value="VIDEOS" labelText={t('Videos personalizados', 'Custom videos')} />
        </RadioButtonGroup>
      </section>

      {kinds.map((kind) => {
        const items = slides.filter((s) => s.kind === kind).sort((a, b) => a.position - b.position)
        return (
          <section key={kind} className={styles.section}>
            <div className={styles.sectionHead}>
              <div>
                <h2 className={styles.sectionTitle}>{kind === 'IMAGE' ? t('Imágenes', 'Images') : t('Videos', 'Videos')}</h2>
                <p className={styles.sectionHelp}>
                  {kind === 'IMAGE'
                    ? t('Se muestran cuando el modo es «Imágenes personalizadas», en este orden.', 'Shown when the mode is "Custom images", in this order.')
                    : t('Se muestran cuando el modo es «Videos personalizados», en este orden. Se reproducen sin sonido y en bucle.', 'Shown when the mode is "Custom videos", in this order. They play muted and looped.')}
                </p>
              </div>
              <Button type="button" size="sm" kind="secondary" renderIcon={Add} onClick={() => openNew(kind)}>
                {kind === 'IMAGE' ? t('Agregar imagen', 'Add image') : t('Agregar video', 'Add video')}
              </Button>
            </div>

            {items.length === 0 ? (
              <p className={styles.sectionHelp}>{t('Sin elementos todavía.', 'No slides yet.')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '.75rem' }}>
                {items.map((slide, idx) => (
                  <li key={slide.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', padding: '.75rem', border: '1px solid var(--cds-border-subtle)' }}>
                    {slide.kind === 'VIDEO' ? (
                      <video src={slide.url} poster={slide.poster_url || undefined} muted playsInline preload="metadata" style={{ width: '6rem', height: '4rem', objectFit: 'cover', background: '#000' }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={slide.url} alt={slide.title_es || ''} style={{ width: '6rem', height: '4rem', objectFit: 'cover', background: '#000' }} />
                    )}
                    <div style={{ flex: 1, minWidth: '12rem' }}>
                      <strong>{slide.title_es || slide.url.split('/').pop()}</strong>
                      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
                        <Tag size="sm" type={slide.enabled ? 'green' : 'gray'}>{slide.enabled ? t('Activo', 'Active') : t('Oculto', 'Hidden')}</Tag>
                        {slide.link_url && <Tag size="sm" type="outline">{t('Con enlace', 'Linked')}</Tag>}
                      </div>
                    </div>
                    <Button type="button" kind="ghost" size="sm" hasIconOnly renderIcon={ArrowUp} iconDescription={t('Subir', 'Move up')} disabled={idx === 0} onClick={() => moveSlide(slide, -1)} />
                    <Button type="button" kind="ghost" size="sm" hasIconOnly renderIcon={ArrowDown} iconDescription={t('Bajar', 'Move down')} disabled={idx === items.length - 1} onClick={() => moveSlide(slide, 1)} />
                    <Button type="button" kind="ghost" size="sm" onClick={() => openEdit(slide)}>{t('Editar', 'Edit')}</Button>
                    <Button type="button" kind="ghost" size="sm" onClick={() => toggleSlide(slide)}>{slide.enabled ? t('Ocultar', 'Hide') : t('Mostrar', 'Show')}</Button>
                    <Button type="button" kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription={t('Eliminar', 'Delete')} onClick={() => removeSlide(slide)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <Modal
        open={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        onRequestSubmit={saveSlide}
        modalHeading={editingId ? t('Editar elemento del Hero', 'Edit Hero slide') : t('Nuevo elemento del Hero', 'New Hero slide')}
        primaryButtonText={saving ? t('Guardando…', 'Saving…') : t('Guardar', 'Save')}
        secondaryButtonText={t('Cancelar', 'Cancel')}
        primaryButtonDisabled={saving}
      >
        <div style={{ display: 'grid', gap: '1rem' }}>
          {draft.kind === 'VIDEO' ? (
            <VideoUploader id="hero-video" currentUrl={draft.url} onChange={(url) => setDraft((d) => ({ ...d, url }))} />
          ) : (
            <ImageUploader currentUrl={draft.url} onUploadComplete={(url) => setDraft((d) => ({ ...d, url }))} />
          )}
          {draft.kind === 'VIDEO' && (
            <TextInput id="hero-poster" labelText={t('Póster del video (URL, opcional)', 'Video poster (URL, optional)')} value={draft.poster_url || ''} onChange={(e) => setDraft((d) => ({ ...d, poster_url: e.target.value }))} />
          )}
          <TextInput id="hero-title-es" labelText={t('Título (español, opcional)', 'Title (Spanish, optional)')} value={draft.title_es || ''} onChange={(e) => setDraft((d) => ({ ...d, title_es: e.target.value }))} />
          <TextInput id="hero-title-en" labelText={t('Título (inglés, opcional)', 'Title (English, optional)')} value={draft.title_en || ''} onChange={(e) => setDraft((d) => ({ ...d, title_en: e.target.value }))} />
          <TextInput id="hero-desc-es" labelText={t('Descripción (español, opcional)', 'Description (Spanish, optional)')} value={draft.description_es || ''} onChange={(e) => setDraft((d) => ({ ...d, description_es: e.target.value }))} />
          <TextInput id="hero-desc-en" labelText={t('Descripción (inglés, opcional)', 'Description (English, optional)')} value={draft.description_en || ''} onChange={(e) => setDraft((d) => ({ ...d, description_en: e.target.value }))} />
          <TextInput id="hero-link" labelText={t('Enlace (opcional, ej. /artwork/JBU-001)', 'Link (optional, e.g. /artwork/JBU-001)')} value={draft.link_url || ''} onChange={(e) => setDraft((d) => ({ ...d, link_url: e.target.value }))} />
          <TextInput id="hero-cta-es" labelText={t('Texto del enlace (español, opcional)', 'Link label (Spanish, optional)')} value={draft.cta_es || ''} onChange={(e) => setDraft((d) => ({ ...d, cta_es: e.target.value }))} />
          <TextInput id="hero-cta-en" labelText={t('Texto del enlace (inglés, opcional)', 'Link label (English, optional)')} value={draft.cta_en || ''} onChange={(e) => setDraft((d) => ({ ...d, cta_en: e.target.value }))} />
          <NumberInput id="hero-position" label={t('Posición', 'Position')} value={draft.position} onChange={(_e, { value }) => setDraft((d) => ({ ...d, position: value }))} min={0} />
          <Toggle id="hero-enabled" labelText={t('Activo', 'Active')} labelA={t('No', 'No')} labelB={t('Sí', 'Yes')} toggled={draft.enabled !== false} onToggle={(checked) => setDraft((d) => ({ ...d, enabled: checked }))} />
        </div>
      </Modal>
    </div>
  )
}
